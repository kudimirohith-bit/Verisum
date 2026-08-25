import { TextChunker } from '../src/chunking/TextChunker.js';
import { HierarchicalSummarizer } from '../src/chunking/HierarchicalSummarizer.js';
import { splitSentences } from '../src/chunking/splitter.js';

const countTokens = (t: string) => (t && t.trim() ? t.trim().split(/\s+/).length : 0);
const stubSummarize = async (t: string): Promise<string> => {
  const w = t.trim().split(/\s+/);
  return w.length <= 20 ? t : w.slice(0, 20).join(' ') + ' [...]';
};

const SENTS = [
  'The patient presented with acute chest pain radiating to the left arm.',
  'Physical examination revealed elevated blood pressure at 160 over 95 mmHg.',
  'An ECG showed ST-segment elevation in the anterior leads.',
  'The patient was transferred to the catheterization lab immediately.',
  'PCI was performed on the left anterior descending artery successfully.',
];

const makeDoc = (n: number) =>
  Array.from({ length: n }, (_, i) => SENTS[i % SENTS.length]).join(' ');

describe('0.5 — Text Chunking & Hierarchical Summarizer Unit Tests', () => {
  describe('splitSentences', () => {
    it('splits 3 sentences', () => {
      const s = splitSentences(SENTS.slice(0, 3).join(' '));
      expect(s.length).toBe(3);
    });

    it('empty string returns []', () => {
      expect(splitSentences('')).toEqual([]);
    });

    it('preserves Dr. abbreviation without splitting incorrectly', () => {
      const s = splitSentences('Dr. Smith reviewed the chart. The patient was stable.');
      expect(s.length).toBeLessThanOrEqual(3);
      const drSent = s.find((x) => x.includes('Dr'));
      expect(drSent?.includes('Smith')).toBe(true);
    });

    it('preserves section headers', () => {
      const s = splitSentences('Assessment:\nNSTEMI suspected. Plan:\nAdmit to CCU.');
      expect(s.some((x) => x.includes('Assessment'))).toBe(true);
      expect(s.some((x) => x.includes('Plan'))).toBe(true);
    });
  });

  describe('TextChunker Constructor Validation', () => {
    it('throws on maxTokensPerChunk = 0', () => {
      expect(() => new TextChunker({ maxTokensPerChunk: 0, overlapTokens: 0, countTokens })).toThrow();
    });

    it('throws if overlapTokens >= maxTokensPerChunk', () => {
      expect(() => new TextChunker({ maxTokensPerChunk: 10, overlapTokens: 10, countTokens })).toThrow();
    });

    it('throws on negative overlapTokens', () => {
      expect(() => new TextChunker({ maxTokensPerChunk: 10, overlapTokens: -1, countTokens })).toThrow();
    });
  });

  describe('TextChunker Chunking Logic', () => {
    it('short doc returns single chunk', () => {
      const c = new TextChunker({ maxTokensPerChunk: 500, overlapTokens: 20, countTokens });
      const chunks = c.chunk(SENTS[0] + ' ' + SENTS[1], 'short');
      expect(chunks.length).toBe(1);
      expect(chunks[0].docId).toBe('short');
      expect(chunks[0].tokenCount).toBeLessThanOrEqual(500);
    });

    it('(a) no chunk exceeds maxTokensPerChunk and (b) ends at sentence boundary', () => {
      const MAX = 50;
      const chunker = new TextChunker({ maxTokensPerChunk: MAX, overlapTokens: 5, countTokens });
      const largeDoc = makeDoc(30);
      const chunks = chunker.chunk(largeDoc, 'large');

      const over = chunks.filter((c) => c.tokenCount > MAX);
      expect(over.length).toBe(0);

      for (const c of chunks) {
        const t = c.text.trimEnd();
        const ok =
          /[.!?]$/.test(t) ||
          /:\s*$/.test(t) ||
          /["')\]]$/.test(t) ||
          t.split(/\s+/).length < 4;
        expect(ok).toBe(true);
      }
    });

    it('(c) chunks cover >= 95% of source sentences', () => {
      const chunker = new TextChunker({ maxTokensPerChunk: 50, overlapTokens: 5, countTokens });
      const largeDoc = makeDoc(30);
      const chunks = chunker.chunk(largeDoc, 'large');
      const sents = splitSentences(largeDoc);
      const allText = chunks.map((c) => c.text).join(' ');

      const covered = sents.filter((s) => {
        const probe = s.slice(0, 20).trim();
        return probe.length > 5 && allText.includes(probe);
      }).length;
      expect(covered / sents.length).toBeGreaterThanOrEqual(0.95);
    });

    it('chunkDocuments tags docId and sets chunkIndex 0 per document', () => {
      const c = new TextChunker({ maxTokensPerChunk: 40, overlapTokens: 4, countTokens });
      const ch = c.chunkDocuments([
        { id: 'DocA', text: makeDoc(6) },
        { id: 'DocB', text: makeDoc(6) },
      ]);
      expect(ch.find((x) => x.docId === 'DocA')?.chunkIndex).toBe(0);
      expect(ch.find((x) => x.docId === 'DocB')?.chunkIndex).toBe(0);
    });
  });

  describe('HierarchicalSummarizer', () => {
    let hs: HierarchicalSummarizer;

    beforeEach(() => {
      hs = new HierarchicalSummarizer({
        maxTokensPerChunk: 40,
        overlapTokens: 4,
        countTokens,
        summarize: stubSummarize,
        maxReduceLevels: 5,
      });
    });

    it('summarizes single short doc', async () => {
      const r = await hs.summarize(SENTS.slice(0, 4).join(' '), 'doc-short');
      expect(r.finalSummary).toBeDefined();
      expect(r.sourceDocIds).toContain('doc-short');
      expect(r.chunkSummaries.length).toBeGreaterThanOrEqual(1);
    });

    it('summarizes long doc with multi-level reduce', async () => {
      const r = await hs.summarize(makeDoc(20), 'doc-long');
      expect(r.finalSummary).toBeDefined();
      expect(r.chunkSummaries.length).toBeGreaterThan(1);
      const l0 = r.chunkSummaries.filter((c) => c.level === 0);
      expect(l0.every((c) => c.docId === 'doc-long')).toBe(true);
    });

    it('multi-document summarization tags source docIds correctly', async () => {
      const r = await hs.summarizeDocuments([
        { id: 'lit-1', text: makeDoc(6) },
        { id: 'lit-2', text: makeDoc(6) },
      ]);
      expect(r.sourceDocIds).toContain('lit-1');
      expect(r.sourceDocIds).toContain('lit-2');
    });
  });
});
