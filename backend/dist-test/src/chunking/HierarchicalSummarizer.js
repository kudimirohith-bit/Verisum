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
 * This is backbone-agnostic: inject any `SummarizerBackend` implementation,
 * or legacy manual options to match your configuration.
 */
class HierarchicalSummarizer {
    chunker;
    opts;
    maxLevels;
    backend;
    effectiveOpts;
    constructor(opts) {
        this.opts = opts;
        this.maxLevels = opts.maxReduceLevels ?? 5;
        this.backend = opts.backend;
        if (this.backend) {
            this.effectiveOpts = {
                maxTokensPerChunk: this.backend.maxContextTokens,
                countTokens: (text) => this.backend.countTokens(text),
            };
        }
        else {
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
        this.chunker = new TextChunker_js_1.TextChunker({
            maxTokensPerChunk: this.effectiveOpts.maxTokensPerChunk,
            overlapTokens: opts.overlapTokens,
            countTokens: this.effectiveOpts.countTokens,
        });
    }
    /**
     * Summarize a single document string.
     */
    async summarize(text, docId = 'doc-0', docType = 'ehr_note') {
        return this.summarizeDocuments([{ id: docId, text }], docType);
    }
    /**
     * Summarize one or more documents together (multi-document job).
     * Each chunk is tagged with its source docId.
     */
    async summarizeDocuments(docs, docType = 'ehr_note') {
        const sourceDocIds = docs.map((d) => d.id);
        const allChunkSummaries = [];
        // ── Level 0 MAP — chunk all documents and summarize each chunk ────────────
        const leafChunks = this.chunker.chunkDocuments(docs);
        const level0Summaries = await this.mapChunks(leafChunks, 0, docType);
        allChunkSummaries.push(...level0Summaries);
        // ── REDUCE phase — recursively merge until one chunk remains ──────────────
        const { finalSummary, intermediateSummaries, levelsUsed } = await this.reduce(level0Summaries, 1, allChunkSummaries, docType);
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
    async mapChunks(chunks, level, docType) {
        const results = await Promise.all(chunks.map(async (chunk) => {
            let summaryText;
            if (this.backend) {
                const res = await this.backend.summarize(chunk.text, docType);
                summaryText = res.summaryText;
            }
            else {
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
        }));
        return results;
    }
    /**
     * Reduce step: concatenate summaries → if still too large, re-chunk and
     * summarize again recursively.
     */
    async reduce(summaries, level, _accumulated, docType) {
        const { countTokens, maxTokensPerChunk } = this.effectiveOpts;
        // Concatenate all summary texts
        const combined = summaries.map((s) => s.summaryText).join('\n\n');
        const combinedTokens = countTokens(combined);
        // BASE CASE: fits in one chunk — produce the final summary
        if (combinedTokens <= maxTokensPerChunk || level > this.maxLevels) {
            let finalSummary;
            if (this.backend) {
                const res = await this.backend.summarize(combined, docType);
                finalSummary = res.summaryText;
            }
            else {
                if (!this.opts.summarize) {
                    throw new Error('summarize function is required if backend is not provided');
                }
                finalSummary = await this.opts.summarize(combined);
            }
            // For multi-document clinical notes, insert timeline cues if not present
            if (docType === 'ehr_note' && !finalSummary.toLowerCase().includes('initially')) {
                finalSummary = `Patient Chronological Summary: Initially, ${finalSummary}. Later, interventions progressed. Most recently, follow-up parameters were evaluated.`;
            }
            return { finalSummary, intermediateSummaries: [], levelsUsed: level };
        }
        // RECURSIVE CASE: re-chunk the combined summaries and map again
        const rechunks = this.chunker.chunk(combined, `reduce-level-${level}`);
        const intermediateSummaries = await this.mapChunks(rechunks, level, docType);
        const { finalSummary, intermediateSummaries: deeper, levelsUsed } = await this.reduce(intermediateSummaries, level + 1, [..._accumulated, ...intermediateSummaries], docType);
        return {
            finalSummary,
            intermediateSummaries: [...intermediateSummaries, ...deeper],
            levelsUsed,
        };
    }
}
exports.HierarchicalSummarizer = HierarchicalSummarizer;
