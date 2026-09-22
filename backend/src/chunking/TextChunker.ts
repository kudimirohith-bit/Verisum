import { splitSentences, detectSectionHeader } from './splitter.js';

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface ChunkOptions {
  /** Maximum number of tokens allowed per chunk */
  maxTokensPerChunk: number;
  /** Overlap tokens carried from the previous chunk (avoids boundary blindness) */
  overlapTokens: number;
  /**
   * Token-counting function — injected by the caller so it matches the
   * backbone model's tokenizer exactly (e.g., tiktoken for GPT-4,
   * transformers tokenizer for BioBART). Must be synchronous.
   */
  countTokens: (text: string) => number;
}

export interface Chunk {
  /** The chunk text (de-identified, ready for model input) */
  text: string;
  /** Token count as measured by the injected countTokens function */
  tokenCount: number;
  /** Zero-based index of this chunk within its source document */
  chunkIndex: number;
  /** Source document identifier (useful for multi-doc jobs) */
  docId: string;
  /** Section header this chunk belongs to, if detected */
  sectionName: string | null;
  /**
   * Sentence indices from the original sentence array
   * [startInclusive, endExclusive]
   */
  sentenceRange: [number, number];
}

export interface ChunkableDocument {
  id: string;
  text: string;
}

// ── TextChunker class ──────────────────────────────────────────────────────────

/**
 * TextChunker splits a document into overlapping chunks that:
 *  - Never exceed maxTokensPerChunk
 *  - Never split mid-sentence
 *  - Prefer splitting at section boundaries for structured clinical documents
 *  - Carry overlapTokens of context from the previous chunk
 */
export class TextChunker {
  private readonly opts: ChunkOptions;

  constructor(opts: ChunkOptions) {
    if (opts.maxTokensPerChunk <= 0) throw new Error('maxTokensPerChunk must be > 0');
    if (opts.overlapTokens < 0) throw new Error('overlapTokens must be >= 0');
    if (opts.overlapTokens >= opts.maxTokensPerChunk) {
      throw new Error('overlapTokens must be less than maxTokensPerChunk');
    }
    this.opts = opts;
  }

  /**
   * Splits a single document string into Chunk objects.
   */
  chunk(text: string, docId = 'doc-0'): Chunk[] {
    const { maxTokensPerChunk, overlapTokens: _overlapTokens, countTokens } = this.opts;

    // If the whole text fits in one chunk — return immediately (no chunking needed)
    const totalTokens = countTokens(text);
    if (totalTokens <= maxTokensPerChunk) {
      return [
        {
          text,
          tokenCount: totalTokens,
          chunkIndex: 0,
          docId,
          sectionName: detectSectionHeader(text),
          sentenceRange: [0, 1],
        },
      ];
    }

    // Split into sentences (section-aware)
    const sentences = splitSentences(text);
    return this.buildChunks(sentences, docId);
  }

  /**
   * Chunks multiple documents, tagging each chunk with its source docId.
   * Chunks are produced per-document (not merged across docs).
   */
  chunkDocuments(docs: ChunkableDocument[]): Chunk[] {
    const allChunks: Chunk[] = [];
    for (const doc of docs) {
      const docChunks = this.chunk(doc.text, doc.id);
      allChunks.push(...docChunks);
    }
    return allChunks;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private buildChunks(sentences: string[], docId: string): Chunk[] {
    const { maxTokensPerChunk, overlapTokens, countTokens } = this.opts;
    const chunks: Chunk[] = [];

    let sentIdx = 0;
    let chunkIndex = 0;

    // Sentences that form the overlap tail from the previous chunk
    let overlapSentences: string[] = [];

    while (sentIdx < sentences.length) {
      const chunkSentences: string[] = [...overlapSentences];
      let chunkTokens = countTokens(chunkSentences.join(' '));
      const startSentIdx = Math.max(0, sentIdx - overlapSentences.length);
      let currentSection: string | null = null;

      // Greedily add sentences until we hit the token limit
      while (sentIdx < sentences.length) {
        const sent = sentences[sentIdx];

        // Detect section boundary: if next sentence opens a new section
        // and we have content, prefer closing the chunk here
        const sectionHeader = detectSectionHeader(sent);
        if (sectionHeader && chunkSentences.length > 0 && !currentSection) {
          // Starting a new section — treat as a natural chunk boundary
          // (only if we already have some content)
          break;
        }
        if (sectionHeader) currentSection = sectionHeader;

        const sentTokens = countTokens(sent);

        // Single sentence exceeds max — must still include it (unavoidable)
        if (sentTokens > maxTokensPerChunk) {
          chunkSentences.push(sent);
          chunkTokens += sentTokens;
          sentIdx++;
          break;
        }

        if (chunkTokens + sentTokens > maxTokensPerChunk) {
          // Adding this sentence would exceed the limit — close the chunk
          break;
        }

        chunkSentences.push(sent);
        chunkTokens += sentTokens;
        sentIdx++;
      }

      if (chunkSentences.length === 0) {
        // Safety: advance if stuck (shouldn't happen)
        sentIdx++;
        continue;
      }

      const chunkText = chunkSentences.join(' ');
      const endSentIdx = startSentIdx + chunkSentences.length;

      chunks.push({
        text: chunkText,
        tokenCount: countTokens(chunkText),
        chunkIndex: chunkIndex++,
        docId,
        sectionName: currentSection,
        sentenceRange: [startSentIdx, endSentIdx],
      });

      // Compute overlap for the next chunk:
      // Walk backwards through chunkSentences until we've accumulated overlapTokens
      overlapSentences = computeOverlap(chunkSentences, overlapTokens, countTokens);
    }

    return chunks;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeOverlap(
  sentences: string[],
  targetTokens: number,
  countTokens: (s: string) => number,
): string[] {
  if (targetTokens === 0) return [];

  const overlap: string[] = [];
  let accumulated = 0;

  for (let i = sentences.length - 1; i >= 0; i--) {
    const t = countTokens(sentences[i]);
    if (accumulated + t > targetTokens && overlap.length > 0) break;
    overlap.unshift(sentences[i]);
    accumulated += t;
    if (accumulated >= targetTokens) break;
  }

  return overlap;
}
