"use strict";
/**
 * Tests for TextChunker and HierarchicalSummarizer.
 *
 * Acceptance criteria from 0.5 spec (verified algorithmically — same properties,
 * smaller synthetic sizes to stay within Jest/ts-jest heap limits):
 * 1. Chunks: (a) never exceed token limit, (b) never split mid-sentence,
 *    (c) collectively cover ≥ 95% of source sentences.
 * 2. HierarchicalSummarizer runs end-to-end with stub summarizer.
 * 3. Covers: short doc (no chunk needed), large doc (multi-chunk, multi-level
 *    reduce), structured doc (section-aware), multi-doc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const TextChunker_1 = require("../src/chunking/TextChunker");
const HierarchicalSummarizer_1 = require("../src/chunking/HierarchicalSummarizer");
const splitter_1 = require("../src/chunking/splitter");
// ── Stub tokenizer: whitespace word count ──────────────────────────────────────
const countTokens = (text) => text && text.trim() ? text.trim().split(/\s+/).length : 0;
// ── Stub summarizer: return first 20 words ────────────────────────────────────
const stubSummarize = async (text) => {
    const words = text.trim().split(/\s+/);
    return words.length <= 20 ? text : words.slice(0, 20).join(' ') + ' [...]';
};
// ── Document fixtures ─────────────────────────────────────────────────────────
/** 15 varied clinical sentences (~12 words each ≈ 180 tokens total) */
const CLINICAL_SENTS = [
    'The patient presented with acute chest pain radiating to the left arm.',
    'Physical examination revealed elevated blood pressure at 160 over 95 mmHg.',
    'An electrocardiogram showed ST-segment elevation in the anterior leads.',
    'The patient was immediately transferred to the cardiac catheterization lab.',
    'Percutaneous coronary intervention was performed on the left anterior descending artery.',
    'Post-procedure the patient was started on dual antiplatelet therapy.',
    'Echocardiography demonstrated preserved ejection fraction of 55 percent.',
    'Troponin levels peaked at 4.2 nanograms per milliliter on admission.',
    'The patient was monitored in the coronary care unit for 48 hours.',
    'Discharge medications included aspirin, clopidogrel, metoprolol, and atorvastatin.',
    'Informed consent was obtained prior to all invasive procedures.',
    'The family was updated regularly regarding the patient clinical progress.',
    'Laboratory values showed a white blood cell count of 11000 per microliter.',
    'Renal function remained stable throughout the hospital course.',
    'Repeat imaging confirmed successful revascularisation of the culprit vessel.',
];
/** Build a ~N-sentence document by repeating sentences round-robin. */
function makeDoc(sentenceCount) {
    const parts = [];
    for (let i = 0; i < sentenceCount; i++) {
        parts.push(CLINICAL_SENTS[i % CLINICAL_SENTS.length]);
    }
    return parts.join(' ');
}
/** Structured clinical document with section headers. */
const STRUCTURED_DOC = `Chief Complaint:
The patient is a 54-year-old male with shortness of breath and chest tightness.

History of Present Illness:
The symptoms began acutely at rest. He denies fever or cough. He reports diaphoresis.

Assessment:
Clinical presentation is consistent with acute coronary syndrome.

Plan:
Initiate antiplatelet therapy. Order cardiology consultation urgently.`;
// ══════════════════════════════════════════════════════════════════════════════
// splitSentences
// ══════════════════════════════════════════════════════════════════════════════
describe('splitSentences()', () => {
    it('splits flowing plain text into sentences', () => {
        const sents = (0, splitter_1.splitSentences)(CLINICAL_SENTS.slice(0, 3).join(' '));
        expect(sents.length).toBe(3);
    });
    it('does not split on medical abbreviations (Dr., Mr.)', () => {
        const text = 'Dr. Smith reviewed the chart. The patient, Mr. Jones, was stable.';
        const sents = (0, splitter_1.splitSentences)(text);
        expect(sents.length).toBeLessThanOrEqual(3);
        // The word "Smith" must appear in the same sentence as "Dr"
        const drSent = sents.find((s) => s.includes('Dr'));
        expect(drSent).toContain('Smith');
    });
    it('preserves section headers as atomic units', () => {
        const sents = (0, splitter_1.splitSentences)(STRUCTURED_DOC);
        expect(sents.some((s) => s.startsWith('Chief Complaint'))).toBe(true);
        expect(sents.some((s) => s.startsWith('Assessment'))).toBe(true);
    });
    it('returns empty array for empty input', () => {
        expect((0, splitter_1.splitSentences)('')).toEqual([]);
        expect((0, splitter_1.splitSentences)('   ')).toEqual([]);
    });
    it('handles single sentence without error', () => {
        const sents = (0, splitter_1.splitSentences)(CLINICAL_SENTS[0]);
        expect(sents.length).toBeGreaterThanOrEqual(1);
    });
});
// ══════════════════════════════════════════════════════════════════════════════
// TextChunker — constructor validation
// ══════════════════════════════════════════════════════════════════════════════
describe('TextChunker — constructor validation', () => {
    it('throws if maxTokensPerChunk <= 0', () => {
        expect(() => new TextChunker_1.TextChunker({ maxTokensPerChunk: 0, overlapTokens: 0, countTokens })).toThrow();
    });
    it('throws if overlapTokens >= maxTokensPerChunk', () => {
        expect(() => new TextChunker_1.TextChunker({ maxTokensPerChunk: 10, overlapTokens: 10, countTokens })).toThrow();
    });
    it('throws if overlapTokens < 0', () => {
        expect(() => new TextChunker_1.TextChunker({ maxTokensPerChunk: 10, overlapTokens: -1, countTokens })).toThrow();
    });
});
// ══════════════════════════════════════════════════════════════════════════════
// TextChunker — short document (no splitting needed)
// ══════════════════════════════════════════════════════════════════════════════
describe('TextChunker — short document (fits in one chunk)', () => {
    const chunker = new TextChunker_1.TextChunker({ maxTokensPerChunk: 500, overlapTokens: 20, countTokens });
    it('returns exactly one chunk', () => {
        const chunks = chunker.chunk(CLINICAL_SENTS[0] + ' ' + CLINICAL_SENTS[1], 'short');
        expect(chunks).toHaveLength(1);
        expect(chunks[0].chunkIndex).toBe(0);
        expect(chunks[0].docId).toBe('short');
        expect(chunks[0].tokenCount).toBeLessThanOrEqual(500);
    });
});
// ══════════════════════════════════════════════════════════════════════════════
// TextChunker — large document (core acceptance criteria)
// ══════════════════════════════════════════════════════════════════════════════
describe('TextChunker — large document (acceptance criteria a / b / c)', () => {
    // 30 sentences × ~12 words = ~360 tokens; chunk limit = 50 tokens → ~7+ chunks
    const MAX_TOKENS = 50;
    const OVERLAP = 5;
    const chunker = new TextChunker_1.TextChunker({ maxTokensPerChunk: MAX_TOKENS, overlapTokens: OVERLAP, countTokens });
    const largeDoc = makeDoc(30);
    let chunks;
    beforeAll(() => {
        chunks = chunker.chunk(largeDoc, 'large-doc');
    });
    // ── (a) no chunk exceeds the token limit ────────────────────────────────────
    it('(a) no chunk exceeds maxTokensPerChunk', () => {
        expect(chunks.length).toBeGreaterThan(1);
        for (const c of chunks) {
            expect(c.tokenCount).toBeLessThanOrEqual(MAX_TOKENS);
        }
    });
    // ── (b) no chunk ends mid-sentence ─────────────────────────────────────────
    it('(b) every chunk ends at a sentence boundary', () => {
        for (const c of chunks) {
            const t = c.text.trimEnd();
            const atBoundary = /[.!?]$/.test(t) || // sentence terminal
                /:\s*$/.test(t) || // section header
                /['")\]]$/.test(t) || // closing quote/bracket
                t.split(/\s+/).length < 4; // trivially short unit
            expect(atBoundary).toBe(true);
        }
    });
    // ── (c) 100% coverage of source sentences ──────────────────────────────────
    it('(c) chunks cover ≥ 95% of source sentences', () => {
        const sourceSents = (0, splitter_1.splitSentences)(largeDoc);
        const allText = chunks.map((c) => c.text).join(' ');
        let covered = 0;
        for (const s of sourceSents) {
            const probe = s.slice(0, 20).trim();
            if (probe.length > 5 && allText.includes(probe))
                covered++;
        }
        expect(covered / sourceSents.length).toBeGreaterThanOrEqual(0.95);
    });
    it('chunks have sequential chunkIndex from 0', () => {
        for (let i = 0; i < chunks.length; i++) {
            expect(chunks[i].chunkIndex).toBe(i);
            expect(chunks[i].docId).toBe('large-doc');
        }
    });
});
// ══════════════════════════════════════════════════════════════════════════════
// TextChunker — structured document (section-boundary preference)
// ══════════════════════════════════════════════════════════════════════════════
describe('TextChunker — structured document with section headers', () => {
    const chunker = new TextChunker_1.TextChunker({ maxTokensPerChunk: 25, overlapTokens: 3, countTokens });
    it('produces multiple chunks and detects at least one sectionName', () => {
        const chunks = chunker.chunk(STRUCTURED_DOC, 'structured');
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.some((c) => c.sectionName !== null)).toBe(true);
    });
});
// ══════════════════════════════════════════════════════════════════════════════
// TextChunker — multi-document support
// ══════════════════════════════════════════════════════════════════════════════
describe('TextChunker — chunkDocuments() multi-doc', () => {
    const chunker = new TextChunker_1.TextChunker({ maxTokensPerChunk: 40, overlapTokens: 4, countTokens });
    it('tags each chunk with its source docId', () => {
        const docs = [
            { id: 'note-a', text: makeDoc(10) },
            { id: 'note-b', text: makeDoc(10) },
            { id: 'note-c', text: makeDoc(6) },
        ];
        const chunks = chunker.chunkDocuments(docs);
        const ids = new Set(chunks.map((c) => c.docId));
        expect(ids.has('note-a')).toBe(true);
        expect(ids.has('note-b')).toBe(true);
        expect(ids.has('note-c')).toBe(true);
    });
    it("each doc's first chunk has chunkIndex = 0", () => {
        const docs = [
            { id: 'x', text: makeDoc(8) },
            { id: 'y', text: makeDoc(8) },
        ];
        const chunks = chunker.chunkDocuments(docs);
        for (const id of ['x', 'y']) {
            const first = chunks.find((c) => c.docId === id);
            expect(first?.chunkIndex).toBe(0);
        }
    });
});
// ══════════════════════════════════════════════════════════════════════════════
// HierarchicalSummarizer — short document (single pass)
// ══════════════════════════════════════════════════════════════════════════════
describe('HierarchicalSummarizer — short document', () => {
    const s = new HierarchicalSummarizer_1.HierarchicalSummarizer({
        maxTokensPerChunk: 500,
        overlapTokens: 20,
        countTokens,
        summarize: stubSummarize,
    });
    it('returns finalSummary, sourceDocIds, and chunkSummaries', async () => {
        const r = await s.summarize(CLINICAL_SENTS.slice(0, 4).join(' '), 'short-doc');
        expect(r.finalSummary).toBeTruthy();
        expect(r.sourceDocIds).toContain('short-doc');
        expect(r.chunkSummaries.length).toBeGreaterThanOrEqual(1);
        expect(r.levelsUsed).toBeGreaterThanOrEqual(1);
    });
});
// ══════════════════════════════════════════════════════════════════════════════
// HierarchicalSummarizer — large document (multi-level reduce)
// ══════════════════════════════════════════════════════════════════════════════
describe('HierarchicalSummarizer — large document (multi-level reduce)', () => {
    const s = new HierarchicalSummarizer_1.HierarchicalSummarizer({
        maxTokensPerChunk: 40,
        overlapTokens: 4,
        countTokens,
        summarize: stubSummarize,
        maxReduceLevels: 5,
    });
    it('runs end-to-end without error', async () => {
        const r = await s.summarize(makeDoc(20), 'large-doc');
        expect(r.finalSummary).toBeTruthy();
        expect(r.chunkSummaries.length).toBeGreaterThan(1);
    });
    it('level-0 chunkSummaries carry the correct docId', async () => {
        const r = await s.summarize(makeDoc(15), 'my-id');
        const l0 = r.chunkSummaries.filter((c) => c.level === 0);
        expect(l0.length).toBeGreaterThan(0);
        l0.forEach((c) => expect(c.docId).toBe('my-id'));
    });
    it('all chunkSummaries have non-empty summaryText', async () => {
        const r = await s.summarize(makeDoc(12), 'text-check');
        r.chunkSummaries.forEach((c) => expect(c.summaryText.trim().length).toBeGreaterThan(0));
    });
    it('sentenceRange [start, end] is valid (end > start)', async () => {
        const r = await s.summarize(makeDoc(10), 'range-check');
        const l0 = r.chunkSummaries.filter((c) => c.level === 0);
        l0.forEach(({ sentenceRange: [a, b] }) => expect(b).toBeGreaterThan(a));
    });
});
// ══════════════════════════════════════════════════════════════════════════════
// HierarchicalSummarizer — multi-document input
// ══════════════════════════════════════════════════════════════════════════════
describe('HierarchicalSummarizer — summarizeDocuments() multi-doc', () => {
    const s = new HierarchicalSummarizer_1.HierarchicalSummarizer({
        maxTokensPerChunk: 40,
        overlapTokens: 4,
        countTokens,
        summarize: stubSummarize,
    });
    it('includes all source docIds in result', async () => {
        const r = await s.summarizeDocuments([
            { id: 'enc-01', text: makeDoc(8) },
            { id: 'enc-02', text: makeDoc(8) },
        ]);
        expect(r.sourceDocIds).toContain('enc-01');
        expect(r.sourceDocIds).toContain('enc-02');
        expect(r.finalSummary).toBeTruthy();
    });
    it('level-0 chunks are tagged with their source docId', async () => {
        const r = await s.summarizeDocuments([
            { id: 'lit-1', text: makeDoc(6) },
            { id: 'lit-2', text: makeDoc(6) },
        ]);
        const ids = new Set(r.chunkSummaries.filter((c) => c.level === 0).map((c) => c.docId));
        expect(ids.has('lit-1')).toBe(true);
        expect(ids.has('lit-2')).toBe(true);
    });
    it('three-document job completes and returns valid finalSummary', async () => {
        const r = await s.summarizeDocuments([
            { id: 'a', text: 'Patient admitted with fever. Prescribed antibiotics.' },
            { id: 'b', text: 'Follow-up visit. Fever resolved. Continue antibiotics.' },
            { id: 'c', text: 'Discharge complete. Patient recovered fully.' },
        ]);
        expect(r.finalSummary).toBeTruthy();
        expect(r.chunkSummaries.length).toBeGreaterThanOrEqual(3);
    });
});
