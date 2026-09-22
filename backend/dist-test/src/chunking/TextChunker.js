"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextChunker = void 0;
const splitter_js_1 = require("./splitter.js");
// ── TextChunker class ──────────────────────────────────────────────────────────
/**
 * TextChunker splits a document into overlapping chunks that:
 *  - Never exceed maxTokensPerChunk
 *  - Never split mid-sentence
 *  - Prefer splitting at section boundaries for structured clinical documents
 *  - Carry overlapTokens of context from the previous chunk
 */
class TextChunker {
    opts;
    constructor(opts) {
        if (opts.maxTokensPerChunk <= 0)
            throw new Error('maxTokensPerChunk must be > 0');
        if (opts.overlapTokens < 0)
            throw new Error('overlapTokens must be >= 0');
        if (opts.overlapTokens >= opts.maxTokensPerChunk) {
            throw new Error('overlapTokens must be less than maxTokensPerChunk');
        }
        this.opts = opts;
    }
    /**
     * Splits a single document string into Chunk objects.
     */
    chunk(text, docId = 'doc-0') {
        const { maxTokensPerChunk, countTokens } = this.opts;
        // If the whole text fits in one chunk — return immediately (no chunking needed)
        const totalTokens = countTokens(text);
        if (totalTokens <= maxTokensPerChunk) {
            return [
                {
                    text,
                    tokenCount: totalTokens,
                    chunkIndex: 0,
                    docId,
                    sectionName: (0, splitter_js_1.detectSectionHeader)(text),
                    sentenceRange: [0, 1],
                },
            ];
        }
        // Split into sentences (section-aware)
        const sentences = (0, splitter_js_1.splitSentences)(text);
        return this.buildChunks(sentences, docId);
    }
    /**
     * Chunks multiple documents, tagging each chunk with its source docId.
     * Chunks are produced per-document (not merged across docs).
     */
    chunkDocuments(docs) {
        const allChunks = [];
        for (const doc of docs) {
            const docChunks = this.chunk(doc.text, doc.id);
            allChunks.push(...docChunks);
        }
        return allChunks;
    }
    // ── Private helpers ──────────────────────────────────────────────────────────
    buildChunks(sentences, docId) {
        const { maxTokensPerChunk, overlapTokens, countTokens } = this.opts;
        const chunks = [];
        let sentIdx = 0;
        let chunkIndex = 0;
        // Sentences that form the overlap tail from the previous chunk
        let overlapSentences = [];
        while (sentIdx < sentences.length) {
            const chunkSentences = [...overlapSentences];
            let chunkTokens = countTokens(chunkSentences.join(' '));
            const startSentIdx = Math.max(0, sentIdx - overlapSentences.length);
            let currentSection = null;
            // Greedily add sentences until we hit the token limit
            while (sentIdx < sentences.length) {
                const sent = sentences[sentIdx];
                // Detect section boundary: if next sentence opens a new section
                // and we have content, prefer closing the chunk here
                const sectionHeader = (0, splitter_js_1.detectSectionHeader)(sent);
                if (sectionHeader && chunkSentences.length > 0 && !currentSection) {
                    // Starting a new section — treat as a natural chunk boundary
                    // (only if we already have some content)
                    break;
                }
                if (sectionHeader)
                    currentSection = sectionHeader;
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
exports.TextChunker = TextChunker;
// ── Helpers ────────────────────────────────────────────────────────────────────
function computeOverlap(sentences, targetTokens, countTokens) {
    if (targetTokens === 0)
        return [];
    const overlap = [];
    let accumulated = 0;
    for (let i = sentences.length - 1; i >= 0; i--) {
        const t = countTokens(sentences[i]);
        if (accumulated + t > targetTokens && overlap.length > 0)
            break;
        overlap.unshift(sentences[i]);
        accumulated += t;
        if (accumulated >= targetTokens)
            break;
    }
    return overlap;
}
