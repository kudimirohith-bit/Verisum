"use strict";
/**
 * Chunking unit test runner — pure Node.js, no Jest overhead.
 * Runs all TextChunker, HierarchicalSummarizer, and splitter tests
 * using Node's built-in assert module.
 *
 * Executed via: node dist-test/tests/chunking.runner.js
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const TextChunker_1 = require("../src/chunking/TextChunker");
const HierarchicalSummarizer_1 = require("../src/chunking/HierarchicalSummarizer");
const splitter_1 = require("../src/chunking/splitter");
// ── Stubs ──────────────────────────────────────────────────────────────────────
const countTokens = (t) => (t && t.trim() ? t.trim().split(/\s+/).length : 0);
const stubSummarize = async (t) => {
    const w = t.trim().split(/\s+/);
    return w.length <= 20 ? t : w.slice(0, 20).join(' ') + ' [...]';
};
// ── Sentence fixtures ──────────────────────────────────────────────────────────
const SENTS = [
    'The patient presented with acute chest pain radiating to the left arm.',
    'Physical examination revealed elevated blood pressure at 160 over 95 mmHg.',
    'An ECG showed ST-segment elevation in the anterior leads.',
    'The patient was transferred to the catheterization lab immediately.',
    'PCI was performed on the left anterior descending artery successfully.',
];
const makeDoc = (n) => Array.from({ length: n }, (_, i) => SENTS[i % SENTS.length]).join(' ');
// ── Test harness ───────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(' ✓', name);
        passed++;
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(' ✗', name, '-', msg);
        failed++;
    }
}
// ── splitSentences ─────────────────────────────────────────────────────────────
test('splitSentences: splits 3 sentences', () => {
    const s = (0, splitter_1.splitSentences)(SENTS.slice(0, 3).join(' '));
    assert.strictEqual(s.length, 3);
});
test('splitSentences: empty string → []', () => {
    assert.deepStrictEqual((0, splitter_1.splitSentences)(''), []);
});
test('splitSentences: Dr. abbreviation not a boundary', () => {
    const s = (0, splitter_1.splitSentences)('Dr. Smith reviewed the chart. The patient was stable.');
    assert.ok(s.length <= 3);
    const drSent = s.find((x) => x.includes('Dr'));
    assert.ok(drSent?.includes('Smith'), '"Dr." split incorrectly');
});
test('splitSentences: section headers preserved', () => {
    const s = (0, splitter_1.splitSentences)('Assessment:\nNSTEMI suspected. Plan:\nAdmit to CCU.');
    assert.ok(s.some((x) => x.includes('Assessment')));
    assert.ok(s.some((x) => x.includes('Plan')));
});
test('splitSentences: single sentence without error', () => {
    const s = (0, splitter_1.splitSentences)(SENTS[0]);
    assert.ok(s.length >= 1);
});
// ── TextChunker — constructor validation ──────────────────────────────────────
test('TextChunker: throws on maxTokensPerChunk = 0', () => {
    assert.throws(() => new TextChunker_1.TextChunker({ maxTokensPerChunk: 0, overlapTokens: 0, countTokens }));
});
test('TextChunker: throws if overlapTokens >= maxTokensPerChunk', () => {
    assert.throws(() => new TextChunker_1.TextChunker({ maxTokensPerChunk: 10, overlapTokens: 10, countTokens }));
});
test('TextChunker: throws on negative overlapTokens', () => {
    assert.throws(() => new TextChunker_1.TextChunker({ maxTokensPerChunk: 10, overlapTokens: -1, countTokens }));
});
// ── Short document (no chunking) ───────────────────────────────────────────────
test('TextChunker: short doc → single chunk', () => {
    const c = new TextChunker_1.TextChunker({ maxTokensPerChunk: 500, overlapTokens: 20, countTokens });
    const chunks = c.chunk(SENTS[0] + ' ' + SENTS[1], 'short');
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].docId, 'short');
    assert.ok(chunks[0].tokenCount <= 500);
});
// ── Large document — acceptance criteria (a)(b)(c) ────────────────────────────
const MAX = 50;
const OVL = 5;
const chunker = new TextChunker_1.TextChunker({ maxTokensPerChunk: MAX, overlapTokens: OVL, countTokens });
const largeDoc = makeDoc(30);
const chunks = chunker.chunk(largeDoc, 'large');
test('(a) no chunk exceeds maxTokensPerChunk', () => {
    const over = chunks.filter((c) => c.tokenCount > MAX);
    assert.strictEqual(over.length, 0, `${over.length} chunks over limit`);
});
test('(b) every chunk ends at a sentence boundary', () => {
    for (const c of chunks) {
        const t = c.text.trimEnd();
        const ok = /[.!?]$/.test(t) ||
            /:\s*$/.test(t) ||
            /["')\]]$/.test(t) ||
            t.split(/\s+/).length < 4;
        assert.ok(ok, `bad chunk ending: "${t.slice(-30)}"`);
    }
});
test('(c) chunks cover ≥ 95% of source sentences', () => {
    const sents = (0, splitter_1.splitSentences)(largeDoc);
    const allText = chunks.map((c) => c.text).join(' ');
    const covered = sents.filter((s) => {
        const probe = s.slice(0, 20).trim();
        return probe.length > 5 && allText.includes(probe);
    }).length;
    const ratio = covered / sents.length;
    assert.ok(ratio >= 0.95, `coverage = ${ratio.toFixed(2)}`);
});
test('chunks have sequential chunkIndex from 0', () => {
    chunks.forEach((c, i) => {
        assert.strictEqual(c.chunkIndex, i);
        assert.strictEqual(c.docId, 'large');
    });
});
test('produces multiple chunks for large doc', () => {
    assert.ok(chunks.length > 1, `expected >1 chunk, got ${chunks.length}`);
});
// ── Structured document (section-boundary preference) ─────────────────────────
test('structured doc: sectionName detected', () => {
    const doc = 'Assessment:\nNSTEMI. Plan:\nAdmit and antiplatelet therapy.';
    const c = new TextChunker_1.TextChunker({ maxTokensPerChunk: 15, overlapTokens: 2, countTokens });
    const ch = c.chunk(doc, 'structured');
    assert.ok(ch.some((x) => x.sectionName !== null), 'no sectionName detected');
});
// ── Multi-document support ────────────────────────────────────────────────────
test('chunkDocuments: tags each chunk with source docId', () => {
    const c = new TextChunker_1.TextChunker({ maxTokensPerChunk: 40, overlapTokens: 4, countTokens });
    const ch = c.chunkDocuments([
        { id: 'A', text: makeDoc(8) },
        { id: 'B', text: makeDoc(8) },
    ]);
    const ids = new Set(ch.map((x) => x.docId));
    assert.ok(ids.has('A') && ids.has('B'));
});
test('chunkDocuments: each doc starts at chunkIndex 0', () => {
    const c = new TextChunker_1.TextChunker({ maxTokensPerChunk: 40, overlapTokens: 4, countTokens });
    const ch = c.chunkDocuments([
        { id: 'X', text: makeDoc(6) },
        { id: 'Y', text: makeDoc(6) },
    ]);
    for (const id of ['X', 'Y']) {
        assert.strictEqual(ch.find((x) => x.docId === id)?.chunkIndex, 0, `${id} first chunk not at index 0`);
    }
});
// ── HierarchicalSummarizer (async) ────────────────────────────────────────────
async function runAsyncTests() {
    const hs = new HierarchicalSummarizer_1.HierarchicalSummarizer({
        maxTokensPerChunk: 40,
        overlapTokens: 4,
        countTokens,
        summarize: stubSummarize,
        maxReduceLevels: 5,
    });
    // Short doc
    try {
        const r = await hs.summarize(SENTS.slice(0, 4).join(' '), 'doc-short');
        assert.ok(r.finalSummary, 'no finalSummary');
        assert.ok(r.sourceDocIds.includes('doc-short'));
        assert.ok(r.chunkSummaries.length >= 1);
        console.log(' ✓ HierarchicalSummarizer: short doc returns result');
        passed++;
    }
    catch (e) {
        console.error(' ✗ HierarchicalSummarizer: short doc -', e.message);
        failed++;
    }
    // Long doc — multi-level reduce
    try {
        const r = await hs.summarize(makeDoc(20), 'doc-long');
        assert.ok(r.finalSummary);
        assert.ok(r.chunkSummaries.length > 1);
        const l0 = r.chunkSummaries.filter((c) => c.level === 0);
        assert.ok(l0.length > 0);
        assert.ok(l0.every((c) => c.docId === 'doc-long'));
        assert.ok(l0.every((c) => c.summaryText.trim().length > 0));
        console.log(' ✓ HierarchicalSummarizer: long doc multi-level reduce');
        passed++;
    }
    catch (e) {
        console.error(' ✗ HierarchicalSummarizer: long doc -', e.message);
        failed++;
    }
    // sentenceRange validity
    try {
        const r = await hs.summarize(makeDoc(10), 'doc-range');
        const l0 = r.chunkSummaries.filter((c) => c.level === 0);
        l0.forEach(({ sentenceRange: [a, b] }) => assert.ok(b > a, `invalid sentenceRange [${a}, ${b}]`));
        console.log(' ✓ HierarchicalSummarizer: sentenceRange [start, end] valid');
        passed++;
    }
    catch (e) {
        console.error(' ✗ HierarchicalSummarizer: sentenceRange -', e.message);
        failed++;
    }
    // Multi-doc: source tagging
    try {
        const r = await hs.summarizeDocuments([
            { id: 'lit-1', text: makeDoc(6) },
            { id: 'lit-2', text: makeDoc(6) },
        ]);
        assert.ok(r.sourceDocIds.includes('lit-1') && r.sourceDocIds.includes('lit-2'));
        const ids = new Set(r.chunkSummaries.filter((c) => c.level === 0).map((c) => c.docId));
        assert.ok(ids.has('lit-1') && ids.has('lit-2'));
        console.log(' ✓ HierarchicalSummarizer: multi-doc source tagging');
        passed++;
    }
    catch (e) {
        console.error(' ✗ HierarchicalSummarizer: multi-doc -', e.message);
        failed++;
    }
    // Three-document job
    try {
        const r = await hs.summarizeDocuments([
            { id: 'a', text: 'Patient admitted with fever. Prescribed antibiotics.' },
            { id: 'b', text: 'Follow-up visit. Fever resolved. Continue antibiotics.' },
            { id: 'c', text: 'Discharge complete. Patient recovered fully.' },
        ]);
        assert.ok(r.finalSummary, 'no finalSummary');
        assert.ok(r.chunkSummaries.length >= 3);
        console.log(' ✓ HierarchicalSummarizer: three-doc job completes');
        passed++;
    }
    catch (e) {
        console.error(' ✗ HierarchicalSummarizer: three-doc job -', e.message);
        failed++;
    }
}
runAsyncTests().then(() => {
    console.log('');
    console.log(`Chunking unit tests: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}).catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
});
