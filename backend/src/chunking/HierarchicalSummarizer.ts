import { TextChunker, Chunk, ChunkOptions, ChunkableDocument } from './TextChunker.js';

// ── Interfaces ─────────────────────────────────────────────────────────────────

/** A summarization function stub injected by the caller (real model in 0.6) */
export type SummarizeFn = (text: string) => Promise<string>;

export interface HierarchicalSummaryOptions extends ChunkOptions {
  /**
   * The summarize function — called for each chunk in the map step and for
   * the concatenated chunk-summaries in the reduce step.
   * In 0.6 this will be wired to BullMQ jobs and the model-service.
   */
  summarize: SummarizeFn;
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
 * This is backbone-agnostic: inject any `summarize` function and any
 * `countTokens` function to match your chosen model.
 */
export class HierarchicalSummarizer {
  private readonly chunker: TextChunker;
  private readonly opts: HierarchicalSummaryOptions;
  private readonly maxLevels: number;

  constructor(opts: HierarchicalSummaryOptions) {
    this.opts = opts;
    this.maxLevels = opts.maxReduceLevels ?? 5;
    this.chunker = new TextChunker({
      maxTokensPerChunk: opts.maxTokensPerChunk,
      overlapTokens: opts.overlapTokens,
      countTokens: opts.countTokens,
    });
  }

  /**
   * Summarize a single document string.
   */
  async summarize(text: string, docId = 'doc-0'): Promise<HierarchicalSummaryResult> {
    return this.summarizeDocuments([{ id: docId, text }]);
  }

  /**
   * Summarize one or more documents together (multi-document job).
   * Each chunk is tagged with its source docId.
   */
  async summarizeDocuments(
    docs: ChunkableDocument[],
  ): Promise<HierarchicalSummaryResult> {
    const sourceDocIds = docs.map((d) => d.id);
    const allChunkSummaries: ChunkSummary[] = [];

    // ── Level 0 MAP — chunk all documents and summarize each chunk ────────────
    const leafChunks = this.chunker.chunkDocuments(docs);

    const level0Summaries = await this.mapChunks(leafChunks, 0);
    allChunkSummaries.push(...level0Summaries);

    // ── REDUCE phase — recursively merge until one chunk remains ──────────────
    const { finalSummary, intermediateSummaries, levelsUsed } =
      await this.reduce(level0Summaries, 1, allChunkSummaries);

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
  private async mapChunks(chunks: Chunk[], level: number): Promise<ChunkSummary[]> {
    // Run in parallel (real implementation will use BullMQ jobs in 0.6)
    const results = await Promise.all(
      chunks.map(async (chunk): Promise<ChunkSummary> => {
        const summaryText = await this.opts.summarize(chunk.text);
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
  ): Promise<{
    finalSummary: string;
    intermediateSummaries: ChunkSummary[];
    levelsUsed: number;
  }> {
    const { countTokens, maxTokensPerChunk, summarize } = this.opts;

    // Concatenate all summary texts
    const combined = summaries.map((s) => s.summaryText).join('\n\n');
    const combinedTokens = countTokens(combined);

    // BASE CASE: fits in one chunk — produce the final summary
    if (combinedTokens <= maxTokensPerChunk || level > this.maxLevels) {
      const finalSummary = await summarize(combined);
      return { finalSummary, intermediateSummaries: [], levelsUsed: level };
    }

    // RECURSIVE CASE: re-chunk the combined summaries and map again
    const rechunks = this.chunker.chunk(combined, `reduce-level-${level}`);
    const intermediateSummaries = await this.mapChunks(rechunks, level);

    const { finalSummary, intermediateSummaries: deeper, levelsUsed } =
      await this.reduce(intermediateSummaries, level + 1, [
        ..._accumulated,
        ...intermediateSummaries,
      ]);

    return {
      finalSummary,
      intermediateSummaries: [...intermediateSummaries, ...deeper],
      levelsUsed,
    };
  }
}
