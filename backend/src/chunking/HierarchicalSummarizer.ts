import { TextChunker, Chunk, ChunkOptions, ChunkableDocument } from './TextChunker.js';
import { SummarizerBackend } from '../models/SummarizerBackend.js';

// ── Interfaces ─────────────────────────────────────────────────────────────────

export type SummarizeFn = (text: string) => Promise<string>;

export interface HierarchicalSummaryOptions {
  /** Pluggable backend to drive token counting and summarization. Optional for backward compatibility. */
  backend?: SummarizerBackend;
  /** Maximum number of tokens allowed per chunk (required if backend is not provided) */
  maxTokensPerChunk?: number;
  /** Overlap tokens carried from the previous chunk */
  overlapTokens: number;
  /** Token-counting function (required if backend is not provided) */
  countTokens?: (text: string) => number;
  /** Legacy: summarize function (required if backend is not provided) */
  summarize?: SummarizeFn;
  /** Maximum reduce levels before giving up (prevents infinite recursion) */
  maxReduceLevels?: number;
}

export interface ChunkSummary {
  chunkIndex: number;
  docId: string;
  sectionName: string | null;
  summaryText: string;
  /** Sentence range from the original document [startInclusive, endExclusive] */
  sentenceRange: [number, number];
  /** Which map-reduce level produced this summary (0 = leaf chunks) */
  level: number;
}

export interface HierarchicalSummaryResult {
  /** The final combined summary produced by the reduce phase */
  finalSummary: string;
  /**
   * All intermediate chunk summaries from every level,
   * ordered by (level, chunkIndex). Useful for tracing claims
   * back to source spans in chunk 0.7.
   */
  chunkSummaries: ChunkSummary[];
  /** Number of map-reduce levels actually used (1 = single pass, no recursion) */
  levelsUsed: number;
  /** Source doc IDs that contributed to this result */
  sourceDocIds: string[];
}

// ── HierarchicalSummarizer class ───────────────────────────────────────────────

/**
 * HierarchicalSummarizer implements the map-reduce strategy:
 *
 *   MAP:    Summarize each chunk independently in parallel.
 *   REDUCE: Concatenate chunk-summaries → if they fit in one chunk,
 *           produce the final summary; otherwise re-chunk and repeat.
 *
 * This is backbone-agnostic: inject any `SummarizerBackend` implementation,
 * or legacy manual options to match your configuration.
 */
export class HierarchicalSummarizer {
  private readonly chunker: TextChunker;
  private readonly opts: HierarchicalSummaryOptions;
  private readonly maxLevels: number;
  private readonly backend?: SummarizerBackend;
  private readonly effectiveOpts: {
    maxTokensPerChunk: number;
    countTokens: (text: string) => number;
  };

  constructor(opts: HierarchicalSummaryOptions) {
    this.opts = opts;
    this.maxLevels = opts.maxReduceLevels ?? 5;
    this.backend = opts.backend;

    if (this.backend) {
      this.effectiveOpts = {
        maxTokensPerChunk: this.backend.maxContextTokens,
        countTokens: (text: string) => this.backend!.countTokens(text),
      };
    } else {
      if (opts.maxTokensPerChunk === undefined) {
        throw new Error('maxTokensPerChunk is required if backend is not provided');
      }
      if (opts.countTokens === undefined) {
        throw new Error('countTokens is required if backend is not provided');
      }
      this.effectiveOpts = {
        maxTokensPerChunk: opts.maxTokensPerChunk,
        countTokens: opts.countTokens,
      };
    }

    this.chunker = new TextChunker({
      maxTokensPerChunk: this.effectiveOpts.maxTokensPerChunk,
      overlapTokens: opts.overlapTokens,
      countTokens: this.effectiveOpts.countTokens,
    });
  }

  /**
   * Summarize a single document string.
   */
  async summarize(
    text: string,
    docId = 'doc-0',
    docType = 'ehr_note',
  ): Promise<HierarchicalSummaryResult> {
    return this.summarizeDocuments([{ id: docId, text }], docType);
  }

  /**
   * Summarize one or more documents together (multi-document job).
   * Each chunk is tagged with its source docId.
   */
  async summarizeDocuments(
    docs: ChunkableDocument[],
    docType = 'ehr_note',
  ): Promise<HierarchicalSummaryResult> {
    const sourceDocIds = docs.map((d) => d.id);
    const allChunkSummaries: ChunkSummary[] = [];

    // ── Level 0 MAP — chunk all documents and summarize each chunk ────────────
    const leafChunks = this.chunker.chunkDocuments(docs);

    const level0Summaries = await this.mapChunks(leafChunks, 0, docType);
    allChunkSummaries.push(...level0Summaries);

    // ── REDUCE phase — recursively merge until one chunk remains ──────────────
    const { finalSummary, intermediateSummaries, levelsUsed } =
      await this.reduce(level0Summaries, 1, allChunkSummaries, docType);

    allChunkSummaries.push(...intermediateSummaries);

    return {
      finalSummary,
      chunkSummaries: allChunkSummaries,
      levelsUsed,
      sourceDocIds,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Map step: summarize each chunk independently */
  private async mapChunks(
    chunks: Chunk[],
    level: number,
    docType: string,
  ): Promise<ChunkSummary[]> {
    const results = await Promise.all(
      chunks.map(async (chunk): Promise<ChunkSummary> => {
        let summaryText: string;
        if (this.backend) {
          const res = await this.backend.summarize(chunk.text, docType);
          summaryText = res.summaryText;
        } else {
          if (!this.opts.summarize) {
            throw new Error('summarize function is required if backend is not provided');
          }
          summaryText = await this.opts.summarize(chunk.text);
        }
        return {
          chunkIndex: chunk.chunkIndex,
          docId: chunk.docId,
          sectionName: chunk.sectionName,
          summaryText,
          sentenceRange: chunk.sentenceRange,
          level,
        };
      }),
    );
    return results;
  }

  /**
   * Reduce step: concatenate summaries → if still too large, re-chunk and
   * summarize again recursively.
   */
  private async reduce(
    summaries: ChunkSummary[],
    level: number,
    _accumulated: ChunkSummary[],
    docType: string,
  ): Promise<{
    finalSummary: string;
    intermediateSummaries: ChunkSummary[];
    levelsUsed: number;
  }> {
    const { countTokens, maxTokensPerChunk } = this.effectiveOpts;

    // Concatenate all summary texts
    const combined = summaries.map((s) => s.summaryText).join('\n\n');
    const combinedTokens = countTokens(combined);

    // BASE CASE: fits in one chunk — produce the final summary
    if (combinedTokens <= maxTokensPerChunk || level > this.maxLevels) {
      let finalSummary: string;
      if (this.backend) {
        const res = await this.backend.summarize(combined, docType);
        finalSummary = res.summaryText;
      } else {
        if (!this.opts.summarize) {
          throw new Error('summarize function is required if backend is not provided');
        }
        finalSummary = await this.opts.summarize(combined);
      }
      return { finalSummary, intermediateSummaries: [], levelsUsed: level };
    }

    // RECURSIVE CASE: re-chunk the combined summaries and map again
    const rechunks = this.chunker.chunk(combined, `reduce-level-${level}`);
    const intermediateSummaries = await this.mapChunks(rechunks, level, docType);

    const { finalSummary, intermediateSummaries: deeper, levelsUsed } =
      await this.reduce(
        intermediateSummaries,
        level + 1,
        [..._accumulated, ...intermediateSummaries],
        docType,
      );

    return {
      finalSummary,
      intermediateSummaries: [...intermediateSummaries, ...deeper],
      levelsUsed,
    };
  }
}
