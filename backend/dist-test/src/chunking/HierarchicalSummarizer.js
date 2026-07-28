"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HierarchicalSummarizer = void 0;
const TextChunker_js_1 = require("./TextChunker.js");
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
class HierarchicalSummarizer {
    chunker;
    opts;
    maxLevels;
    constructor(opts) {
        this.opts = opts;
        this.maxLevels = opts.maxReduceLevels ?? 5;
        this.chunker = new TextChunker_js_1.TextChunker({
            maxTokensPerChunk: opts.maxTokensPerChunk,
            overlapTokens: opts.overlapTokens,
            countTokens: opts.countTokens,
        });
    }
    /**
     * Summarize a single document string.
     */
    async summarize(text, docId = 'doc-0') {
        return this.summarizeDocuments([{ id: docId, text }]);
    }
    /**
     * Summarize one or more documents together (multi-document job).
     * Each chunk is tagged with its source docId.
     */
    async summarizeDocuments(docs) {
        const sourceDocIds = docs.map((d) => d.id);
        const allChunkSummaries = [];
        // ── Level 0 MAP — chunk all documents and summarize each chunk ────────────
        const leafChunks = this.chunker.chunkDocuments(docs);
        const level0Summaries = await this.mapChunks(leafChunks, 0);
        allChunkSummaries.push(...level0Summaries);
        // ── REDUCE phase — recursively merge until one chunk remains ──────────────
        const { finalSummary, intermediateSummaries, levelsUsed } = await this.reduce(level0Summaries, 1, allChunkSummaries);
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
    async mapChunks(chunks, level) {
        // Run in parallel (real implementation will use BullMQ jobs in 0.6)
        const results = await Promise.all(chunks.map(async (chunk) => {
            const summaryText = await this.opts.summarize(chunk.text);
            return {
                chunkIndex: chunk.chunkIndex,
                docId: chunk.docId,
                sectionName: chunk.sectionName,
                summaryText,
                sentenceRange: chunk.sentenceRange,
                level,
            };
        }));
        return results;
    }
    /**
     * Reduce step: concatenate summaries → if still too large, re-chunk and
     * summarize again recursively.
     */
    async reduce(summaries, level, _accumulated) {
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
        const { finalSummary, intermediateSummaries: deeper, levelsUsed } = await this.reduce(intermediateSummaries, level + 1, [
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
exports.HierarchicalSummarizer = HierarchicalSummarizer;
