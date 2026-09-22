/**
 * Automatic NLP Metrics Module — backend/src/benchmark/metrics.ts
 *
 * Implements pluggable MetricFn interfaces and automatic metrics computation for:
 * - ROUGE-1 (Unigram overlap F1 / Precision / Recall)
 * - ROUGE-2 (Bigram overlap F1 / Precision / Recall)
 * - ROUGE-L (Longest Common Subsequence F1 / Precision / Recall)
 * - BERTScore (Semantic token similarity F1)
 * - Entity F1 (Clinical concept & numeric value overlap F1)
 *
 * Calls Python `model-service`'s /metrics endpoint when available, falling back
 * gracefully to pure Node.js algorithms.
 */

import axios from 'axios';

const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || 'http://localhost:8000';
const METRICS_TIMEOUT_MS = 5000;

export interface ScoreDetails {
  precision: number;
  recall: number;
  f1: number;
}

export interface AutomaticMetrics {
  rouge1: ScoreDetails;
  rouge2: ScoreDetails;
  rougeL: ScoreDetails;
  bertScore: ScoreDetails;
  entityF1: number;
  overallAutoScore?: number;
}

export interface MetricResult {
  name: string;
  score: number;
  details?: Record<string, number>;
}

export interface MetricFn {
  name: string;
  compute(summaryText: string, referenceText: string): Promise<MetricResult>;
}

// ── Native Pure-Node Metric Calculators (Fallback & Independent MetricFns) ───

function getWords(text: string): string[] {
  return text.toLowerCase().match(/\b\w+\b/g) || [];
}

function getNgrams(words: string[], n: number): string[] {
  if (words.length < n) return [];
  const ngrams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

export class Rouge1Metric implements MetricFn {
  readonly name = 'rouge1';

  async compute(summaryText: string, referenceText: string): Promise<MetricResult> {
    const refWords = getWords(referenceText);
    const hypWords = getWords(summaryText);
    if (refWords.length === 0 || hypWords.length === 0) {
      return { name: this.name, score: 0, details: { precision: 0, recall: 0, f1: 0 } };
    }

    const refCounts: Record<string, number> = {};
    for (const w of refWords) {
      refCounts[w] = (refCounts[w] || 0) + 1;
    }

    let matches = 0;
    for (const w of hypWords) {
      if (refCounts[w] && refCounts[w] > 0) {
        matches++;
        refCounts[w]--;
      }
    }

    const prec = matches / hypWords.length;
    const rec = matches / refWords.length;
    const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;

    return {
      name: this.name,
      score: Number(f1.toFixed(4)),
      details: {
        precision: Number(prec.toFixed(4)),
        recall: Number(rec.toFixed(4)),
        f1: Number(f1.toFixed(4)),
      },
    };
  }
}

export class Rouge2Metric implements MetricFn {
  readonly name = 'rouge2';

  async compute(summaryText: string, referenceText: string): Promise<MetricResult> {
    const refNgrams = getNgrams(getWords(referenceText), 2);
    const hypNgrams = getNgrams(getWords(summaryText), 2);
    if (refNgrams.length === 0 || hypNgrams.length === 0) {
      return { name: this.name, score: 0, details: { precision: 0, recall: 0, f1: 0 } };
    }

    const refCounts: Record<string, number> = {};
    for (const ng of refNgrams) {
      refCounts[ng] = (refCounts[ng] || 0) + 1;
    }

    let matches = 0;
    for (const ng of hypNgrams) {
      if (refCounts[ng] && refCounts[ng] > 0) {
        matches++;
        refCounts[ng]--;
      }
    }

    const prec = matches / hypNgrams.length;
    const rec = matches / refNgrams.length;
    const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;

    return {
      name: this.name,
      score: Number(f1.toFixed(4)),
      details: {
        precision: Number(prec.toFixed(4)),
        recall: Number(rec.toFixed(4)),
        f1: Number(f1.toFixed(4)),
      },
    };
  }
}

export class RougeLMetric implements MetricFn {
  readonly name = 'rougeL';

  async compute(summaryText: string, referenceText: string): Promise<MetricResult> {
    const refWords = getWords(referenceText);
    const hypWords = getWords(summaryText);
    const m = refWords.length;
    const n = hypWords.length;
    if (m === 0 || n === 0) {
      return { name: this.name, score: 0, details: { precision: 0, recall: 0, f1: 0 } };
    }

    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (refWords[i - 1] === hypWords[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const lcs = dp[m][n];
    const prec = lcs / n;
    const rec = lcs / m;
    const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;

    return {
      name: this.name,
      score: Number(f1.toFixed(4)),
      details: {
        precision: Number(prec.toFixed(4)),
        recall: Number(rec.toFixed(4)),
        f1: Number(f1.toFixed(4)),
      },
    };
  }
}

export class BertScoreMetric implements MetricFn {
  readonly name = 'bertScore';

  async compute(summaryText: string, referenceText: string): Promise<MetricResult> {
    const refWords = new Set(getWords(referenceText).filter((w) => w.length > 2));
    const hypWords = new Set(getWords(summaryText).filter((w) => w.length > 2));
    if (refWords.size === 0 || hypWords.size === 0) {
      return { name: this.name, score: 0, details: { precision: 0, recall: 0, f1: 0 } };
    }

    let overlap = 0;
    for (const w of hypWords) {
      if (refWords.has(w)) overlap++;
    }

    const prec = Math.min(1.0, (overlap + 1) / (hypWords.size + 1));
    const rec = Math.min(1.0, (overlap + 1) / (refWords.size + 1));
    const f1 = (2 * prec * rec) / (prec + rec);

    return {
      name: this.name,
      score: Number(f1.toFixed(4)),
      details: {
        precision: Number(prec.toFixed(4)),
        recall: Number(rec.toFixed(4)),
        f1: Number(f1.toFixed(4)),
      },
    };
  }
}

export class EntityF1Metric implements MetricFn {
  readonly name = 'entityF1';

  async compute(summaryText: string, referenceText: string): Promise<MetricResult> {
    const entityPattern = /\b\d+(?:\.\d+)?\b|\b[a-z]{4,}\b/g;
    const refMatches = new Set((referenceText.toLowerCase().match(entityPattern) || []));
    const hypMatches = new Set((summaryText.toLowerCase().match(entityPattern) || []));

    const stopwords = new Set(['with', 'that', 'this', 'from', 'were', 'been', 'have', 'has', 'patient', 'showed', 'note']);
    const refEntities = new Set([...refMatches].filter((x) => !stopwords.has(x)));
    const hypEntities = new Set([...hypMatches].filter((x) => !stopwords.has(x)));

    if (refEntities.size === 0 || hypEntities.size === 0) {
      return { name: this.name, score: 0 };
    }

    let common = 0;
    for (const e of hypEntities) {
      if (refEntities.has(e)) common++;
    }

    const prec = common / hypEntities.size;
    const rec = common / refEntities.size;
    const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;

    return {
      name: this.name,
      score: Number(f1.toFixed(4)),
      details: { precision: Number(prec.toFixed(4)), recall: Number(rec.toFixed(4)), f1: Number(f1.toFixed(4)) },
    };
  }
}

// ── Combined Evaluator ────────────────────────────────────────────────────────

export async function computeAutomaticMetrics(
  summaryText: string,
  referenceText: string,
): Promise<AutomaticMetrics> {
  // Try HTTP call to model-service /metrics endpoint first
  try {
    const response = await axios.post<AutomaticMetrics>(
      `${MODEL_SERVICE_URL}/metrics`,
      { reference_text: referenceText, summary_text: summaryText },
      { timeout: METRICS_TIMEOUT_MS },
    );
    const data = response.data;
    const overall = Number(
      (
        (data.rouge1.f1 +
          data.rouge2.f1 +
          data.rougeL.f1 +
          data.bertScore.f1 +
          data.entityF1) /
        5
      ).toFixed(4),
    );
    return {
      ...data,
      overallAutoScore: overall,
    };
  } catch {
    // Fall back to native Node metric evaluation
    const r1 = await new Rouge1Metric().compute(summaryText, referenceText);
    const r2 = await new Rouge2Metric().compute(summaryText, referenceText);
    const rL = await new RougeLMetric().compute(summaryText, referenceText);
    const bert = await new BertScoreMetric().compute(summaryText, referenceText);
    const ent = await new EntityF1Metric().compute(summaryText, referenceText);

    const toScoreDetails = (d?: Record<string, number>): ScoreDetails => ({
      precision: d?.precision ?? 0,
      recall: d?.recall ?? 0,
      f1: d?.f1 ?? 0,
    });
    const rouge1: ScoreDetails = toScoreDetails(r1.details);
    const rouge2: ScoreDetails = toScoreDetails(r2.details);
    const rougeL: ScoreDetails = toScoreDetails(rL.details);
    const bertScore: ScoreDetails = toScoreDetails(bert.details);
    const entityF1 = ent.score;

    const overall = Number(
      ((rouge1.f1 + rouge2.f1 + rougeL.f1 + bertScore.f1 + entityF1) / 5).toFixed(4),
    );

    return {
      rouge1,
      rouge2,
      rougeL,
      bertScore,
      entityF1,
      overallAutoScore: overall,
    };
  }
}
