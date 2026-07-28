# Chunking & Hierarchical Summarization — Design Notes

## Overview

Long clinical documents (EHR timelines, full discharge summaries, biomedical
literature) routinely exceed any LLM's context window. This module addresses
that by implementing a **map-reduce hierarchical summarization** strategy that
is fully backbone-agnostic — you inject the tokenizer and summarizer.

---

## Map-Reduce Strategy

```
Source Document(s)
        │
        ▼
  TextChunker.chunk()
        │  Sentence-aware, section-boundary preferring,
        │  overlapping windows
        ▼
  ┌───────────────────────────────┐
  │  [Chunk 0] [Chunk 1] ... [Chunk N]   ← Level 0 (leaf)
  └───────────────────────────────┘
        │  MAP: summarize each chunk independently (parallel)
        ▼
  ┌─────────────────────────────────────┐
  │  [Sum 0]   [Sum 1]   ... [Sum N]    │
  └─────────────────────────────────────┘
        │
        ├─ fits in one window? ──► REDUCE: summarize(concat) ──► Final Summary
        │
        └─ still too large? ──► re-chunk summaries ──► MAP again (Level 1)
                                        │
                                        └─ repeat until fits ──► Final Summary
```

### Why Map-Reduce?

| Property | Map-Reduce (this module) | Retrieval-Augmented (RAG) |
|---|---|---|
| **Coverage** | 100% of source text processed | Only top-k retrieved chunks |
| **Order-sensitivity** | Preserves narrative arc | Loses temporal/causal order |
| **Privacy** | No external retrieval index needed | Embedding store adds attack surface |
| **Cost** | O(N) model calls | O(1) for retrieval, O(k) for context |
| **Best for** | Discharge summaries, full notes | Large literature corpora, Q&A |

For VeriSumm's primary use case (full clinical note summarization with
safety-critical coverage), map-reduce is the preferred default. RAG will be
considered in a future extension chunk for literature-augmented Q&A.

---

## TextChunker Configuration

```typescript
const chunker = new TextChunker({
  maxTokensPerChunk: 800,   // must fit within model context minus prompt overhead
  overlapTokens:      80,   // ~10% overlap to avoid boundary blindness
  countTokens: (text) => text.split(/\s+/).length, // inject your tokenizer
});
```

### Chunking Hierarchy (priority order)
1. **Section boundaries** — detected by header regex (e.g., `Assessment:`, `Plan:`, `## Methods`)
2. **Paragraph boundaries** — double newlines
3. **Sentence boundaries** — end-of-sentence punctuation, abbreviation-safe
4. **Hard cut** — only if a single sentence exceeds `maxTokensPerChunk` (unavoidable)

---

## HierarchicalSummarizer Configuration

```typescript
const summarizer = new HierarchicalSummarizer({
  maxTokensPerChunk: 800,
  overlapTokens: 80,
  countTokens: myTokenizer,
  summarize: async (text) => {
    // In 0.6: dispatches a BullMQ job → model-service / hosted LLM
    return callModel(text);
  },
  maxReduceLevels: 5,
});

const result = await summarizer.summarize(documentText, 'doc-123');
// result.finalSummary         — the final output
// result.chunkSummaries       — intermediate summaries (for 0.7 claim tracing)
// result.levelsUsed           — how many reduce levels were needed
// result.sourceDocIds         — which documents contributed
```

---

## Multi-Document Input

```typescript
const result = await summarizer.summarizeDocuments([
  { id: 'note-2024-01', text: ehrNote1 },
  { id: 'note-2024-02', text: ehrNote2 },
  { id: 'abstract-17', text: literatureAbstract },
]);
// Each chunk in result.chunkSummaries carries its source docId
```

This supports summarizing a **patient's note history** across multiple
encounters, or summarizing **related literature abstracts** together.

---

## Tradeoffs & Future Work

- **Chunk overlap** reduces boundary blindness but means some tokens are
  summarized twice — acceptable for accuracy, costs ~10% more tokens.
- **Section splitting** improves clinical coherence but requires document
  structure; free-form text falls back to sentence splitting cleanly.
- **Reduce convergence**: with typical 150-200 token chunk summaries and
  an 800-token window, level 1 reduce handles up to ~4 chunks, level 2
  up to ~16, level 3 up to ~64. Most clinical documents converge in ≤ 2 levels.
- **Future**: add a retrieval-augmented mode for literature corpora >100k tokens
  where exhaustive coverage is less critical than relevance.
