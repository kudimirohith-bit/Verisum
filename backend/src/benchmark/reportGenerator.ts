/**
 * Markdown Benchmark Report Generator — backend/src/benchmark/reportGenerator.ts
 *
 * Produces structured GitHub-flavored Markdown reports summarizing model benchmark runs,
 * correlation analyses, metric-human disagreement matrices, and safety metric breakdowns.
 */

import { IBackendBenchmarkResult } from '../models/BenchmarkRun.js';
import { MetricHumanCorrelation } from './stats.js';

export interface DisagreementCase {
  summaryId: string;
  modelBackend: string;
  docType: string;
  rouge1F1: number;
  bertScoreF1: number;
  consistencyScore: number;
  humanCorrectness: number;
  disagreementScore: number;
  reason: string;
}

export interface ReportData {
  runId: string;
  runName: string;
  createdAt: Date;
  documentCount: number;
  backendsEvaluated: string[];
  resultsPerBackend: IBackendBenchmarkResult[];
  correlationStats: MetricHumanCorrelation[];
  disagreements?: DisagreementCase[];
  docTypeBreakdown?: Record<string, Record<string, number>>;
}

export function generateBenchmarkMarkdownReport(data: ReportData): string {
  const lines: string[] = [];

  // Title & Metadata
  lines.push(`# VeriSumm Benchmarking Report: ${data.runName}`);
  lines.push(`**Run ID:** \`${data.runId}\`  `);
  lines.push(`**Date:** ${new Date(data.createdAt).toISOString()}  `);
  lines.push(`**Documents Evaluated:** ${data.documentCount}  `);
  lines.push(`**Model Backends Compared:** ${data.backendsEvaluated.map((b) => `\`${b}\``).join(', ')}  `);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. Executive Summary & Comparison Table
  lines.push('## 1. Model Backend Comparison Summary');
  lines.push('');
  lines.push('| Backend | Count | ROUGE-1 (F1) | ROUGE-2 (F1) | ROUGE-L (F1) | BERTScore | Entity F1 | Consistency | Human Overall | Latency | Flagged Rate |');
  lines.push('|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|');

  for (const b of data.resultsPerBackend) {
    const r1 = b.avgRouge1.toFixed(3);
    const r2 = b.avgRouge2.toFixed(3);
    const rL = b.avgRougeL.toFixed(3);
    const bert = b.avgBertScore.toFixed(3);
    const ent = b.avgEntityF1.toFixed(3);
    const cons = b.avgConsistencyScore.toFixed(3);
    const human = b.avgClinicianOverall !== null && b.avgClinicianOverall !== undefined ? `${b.avgClinicianOverall.toFixed(2)} / 5.0` : 'N/A';
    const lat = `${b.avgLatencyMs.toFixed(0)} ms`;
    const flag = `${(b.flaggedClaimRate * 100).toFixed(1)}%`;

    lines.push(`| **${b.modelBackend}** | ${b.count} | ${r1} | ${r2} | ${rL} | ${bert} | ${ent} | ${cons} | ${human} | ${lat} | ${flag} |`);
  }

  lines.push('');

  // 2. Best Performers per Metric
  lines.push('## 2. Metric Leaderboard & Best Performers');
  lines.push('');

  if (data.resultsPerBackend.length > 0) {
    const bestRouge1 = [...data.resultsPerBackend].sort((a, b) => b.avgRouge1 - a.avgRouge1)[0];
    const bestBERT = [...data.resultsPerBackend].sort((a, b) => b.avgBertScore - a.avgBertScore)[0];
    const bestEntity = [...data.resultsPerBackend].sort((a, b) => b.avgEntityF1 - a.avgEntityF1)[0];
    const bestConsistency = [...data.resultsPerBackend].sort((a, b) => b.avgConsistencyScore - a.avgConsistencyScore)[0];
    const fastest = [...data.resultsPerBackend].sort((a, b) => a.avgLatencyMs - b.avgLatencyMs)[0];

    lines.push(`- **Highest ROUGE-1 Overlap:** \`${bestRouge1.modelBackend}\` (${bestRouge1.avgRouge1.toFixed(3)})`);
    lines.push(`- **Highest BERTScore Semantic Match:** \`${bestBERT.modelBackend}\` (${bestBERT.avgBertScore.toFixed(3)})`);
    lines.push(`- **Highest Clinical Entity Grounding:** \`${bestEntity.modelBackend}\` (${bestEntity.avgEntityF1.toFixed(3)})`);
    lines.push(`- **Highest Factual Consistency (NLI):** \`${bestConsistency.modelBackend}\` (${bestConsistency.avgConsistencyScore.toFixed(3)})`);
    lines.push(`- **Fastest Inference Speed:** \`${fastest.modelBackend}\` (${fastest.avgLatencyMs.toFixed(0)} ms)`);
  }
  lines.push('');

  // 3. Correlation Analysis (Automatic Metrics vs Human Judgment)
  lines.push('## 3. Automatic Metrics vs. Clinician Judgment Correlation');
  lines.push('');
  lines.push('Empirical study evaluating how standard automatic NLP metrics correlate with clinician rating dimensions.');
  lines.push('');
  lines.push('| Automatic Metric | Human Dimension | Sample Size | Pearson (r) | Spearman (ρ) | Interpretation |');
  lines.push('|:---|:---|:---:|:---:|:---:|:---|');

  if (data.correlationStats && data.correlationStats.length > 0) {
    for (const c of data.correlationStats) {
      const r = c.pearsonR.toFixed(3);
      const rho = c.spearmanRho.toFixed(3);
      lines.push(`| \`${c.metricName}\` | ${c.humanDimension} | ${c.sampleSize} | **${r}** | **${rho}** | ${c.interpretation} |`);
    }
  } else {
    lines.push('| N/A | N/A | 0 | N/A | N/A | Insufficient clinician feedback pairs for correlation analysis |');
  }

  lines.push('');

  // 4. Metric-Human Disagreement Analysis (Gap Surface)
  lines.push('## 4. Key Disagreements: Automatic NLP Metrics vs. Human Safety');
  lines.push('');
  lines.push('Highlighting instances where lexical/ngram metrics (ROUGE) rated summaries highly despite low clinician correctness ratings due to subtle hallucinations.');
  lines.push('');

  if (data.disagreements && data.disagreements.length > 0) {
    lines.push('| Summary ID | Backend | DocType | ROUGE-1 | BERTScore | NLI Consistency | Clinician Correctness | Disagreement Cause |');
    lines.push('|:---|:---|:---|:---:|:---:|:---:|:---:|:---|');
    for (const d of data.disagreements) {
      lines.push(`| \`${d.summaryId.slice(-6)}\` | \`${d.modelBackend}\` | ${d.docType} | ${d.rouge1F1.toFixed(2)} | ${d.bertScoreF1.toFixed(2)} | ${d.consistencyScore.toFixed(2)} | **${d.humanCorrectness} / 5** | ${d.reason} |`);
    }
  } else {
    lines.push('No severe metric-human disagreements detected in this benchmark evaluation run.');
  }

  lines.push('');

  // 5. Conclusion & Recommendations
  lines.push('## 5. Summary & Governance Recommendations');
  lines.push('');
  lines.push('1. **Safety First:** Lexical metrics like ROUGE fail to detect critical numerical or negation flips in clinical text. NLI-based consistency scoring and entity grounding must remain mandatory safety gates before summary presentation.');
  lines.push('2. **Model Selection:** Use domain-adapted backends (`local_clinical_model` or fine-tuned LLMs) for acute discharge notes, reserving generative APIs for non-sensitive dialogue transcripts.');
  lines.push('');

  return lines.join('\n');
}
