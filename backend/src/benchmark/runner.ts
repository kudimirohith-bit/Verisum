/**
 * Benchmark Execution Core Runner — backend/src/benchmark/runner.ts
 *
 * Orchestrates offline + online benchmark execution across document sets and model backends:
 * 1. Runs HierarchicalSummarizer for each (document, modelBackend) pair.
 * 2. Executes VerificationPipeline (NLI, entity grounding, LLM judge).
 * 3. Evaluates automatic metrics (ROUGE-1/2/L, BERTScore, Entity F1).
 * 4. Merges clinician feedback ratings.
 * 5. Computes Pearson & Spearman correlation coefficients.
 * 6. Generates and persists BenchmarkRun records and Markdown reports.
 */

import { DocumentModel } from '../models/Document.js';
import { SummarizationJobModel } from '../models/SummarizationJob.js';
import { SummaryModel } from '../models/Summary.js';
import { ClinicianFeedbackModel } from '../models/ClinicianFeedback.js';
import { BenchmarkRunModel, IBackendBenchmarkResult, IBenchmarkRun } from '../models/BenchmarkRun.js';
import { BackendRegistry } from '../summarizer/backends.js';
import { HierarchicalSummarizer } from '../chunking/HierarchicalSummarizer.js';
import { VerificationPipeline } from '../verification/index.js';
import { computeAutomaticMetrics, AutomaticMetrics } from './metrics.js';
import { computeCorrelationStats, SummaryEvaluationPair } from './stats.js';
import { generateBenchmarkMarkdownReport, DisagreementCase } from './reportGenerator.js';
import { AuditLogger } from '../audit/AuditLogger.js';

export interface BenchmarkRunOptions {
  name?: string;
  documentIds?: string[];
  modelBackends?: string[];
  docType?: string;
}

export async function runBenchmarkSuite(
  options: BenchmarkRunOptions = {},
): Promise<IBenchmarkRun> {
  const runName = options.name || `Benchmark Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

  // 1. Resolve target documents
  let documents = [];
  if (options.documentIds && options.documentIds.length > 0) {
    documents = await DocumentModel.find({ _id: { $in: options.documentIds } });
  } else {
    documents = await DocumentModel.find({}).limit(10);
  }

  if (documents.length === 0) {
    throw new Error('No documents found to benchmark against.');
  }

  const modelBackends = options.modelBackends && options.modelBackends.length > 0
    ? options.modelBackends
    : ['mock', 'local_clinical_model', 'hosted_llm'];

  // Create initial BenchmarkRun record
  const benchmarkRun = await BenchmarkRunModel.create({
    name: runName,
    status: 'running',
    config: {
      documentIds: documents.map((d) => d._id),
      modelBackends,
      docType: options.docType,
    },
    resultsPerBackend: [],
    correlationStats: [],
  });

  try {
    const rawResults: Array<{
      backend: string;
      docId: string;
      docType: string;
      summaryId: string;
      latencyMs: number;
      autoMetrics: AutomaticMetrics;
      consistencyScore: number | null;
      flaggedCount: number;
    }> = [];

    const pipeline = new VerificationPipeline();

    // 2. Execute benchmark grid: every document × every modelBackend
    for (const doc of documents) {
      const docType = options.docType || doc.docType || 'ehr_note';
      const sourceChunks = [{ id: doc._id.toString(), text: doc.rawText }];

      for (const backendName of modelBackends) {
        const start = Date.now();

        // Summarize
        const backend = BackendRegistry.get(backendName);
        const overlapTokens = Math.max(5, Math.floor(backend.maxContextTokens * 0.1));
        const summarizer = new HierarchicalSummarizer({ backend, overlapTokens });
        const summaryResult = await summarizer.summarizeDocuments(
          [{ id: doc._id.toString(), text: doc.rawText }],
          docType,
        );

        const latencyMs = Math.max(1, Date.now() - start);

        // Compute Automatic NLP Metrics
        const autoMetrics = await computeAutomaticMetrics(summaryResult.finalSummary, doc.rawText);

        // Run Verification Pipeline (NLI + Entity Grounding)
        const verificationResult = await pipeline.verify(
          summaryResult.finalSummary,
          sourceChunks,
          docType,
        );

        // Persist dummy job + Summary model for audit/benchmark traceability
        const job = await SummarizationJobModel.create({
          documentIds: [doc._id],
          modelBackend: backendName,
          status: 'completed',
          completedAt: new Date(),
        });

        const summaryDoc = await SummaryModel.create({
          jobId: job._id,
          summaryText: summaryResult.finalSummary,
          tokenCount: backend.countTokens(summaryResult.finalSummary),
          automaticMetrics: autoMetrics,
          consistencyScore: verificationResult.consistencyScore,
          flaggedClaims: verificationResult.flaggedClaims,
        });

        rawResults.push({
          backend: backendName,
          docId: doc._id.toString(),
          docType,
          summaryId: summaryDoc._id.toString(),
          latencyMs,
          autoMetrics,
          consistencyScore: verificationResult.consistencyScore,
          flaggedCount: verificationResult.flaggedClaims.length,
        });
      }
    }

    // 3. Aggregate results per backend
    const resultsPerBackend: IBackendBenchmarkResult[] = [];

    for (const backendName of modelBackends) {
      const items = rawResults.filter((r) => r.backend === backendName);
      if (items.length === 0) continue;

      const count = items.length;
      const avgRouge1 = items.reduce((sum, i) => sum + i.autoMetrics.rouge1.f1, 0) / count;
      const avgRouge2 = items.reduce((sum, i) => sum + i.autoMetrics.rouge2.f1, 0) / count;
      const avgRougeL = items.reduce((sum, i) => sum + i.autoMetrics.rougeL.f1, 0) / count;
      const avgBertScore = items.reduce((sum, i) => sum + i.autoMetrics.bertScore.f1, 0) / count;
      const avgEntityF1 = items.reduce((sum, i) => sum + i.autoMetrics.entityF1, 0) / count;
      const avgConsistencyScore = items.reduce((sum, i) => sum + (i.consistencyScore ?? 0), 0) / count;
      const avgLatencyMs = items.reduce((sum, i) => sum + i.latencyMs, 0) / count;
      const flaggedClaimRate = items.reduce((sum, i) => sum + (i.flaggedCount > 0 ? 1 : 0), 0) / count;

      // Fetch feedback averages for summaries produced by this backend
      const summaryIds = items.map((i) => i.summaryId);
      const feedbackDocs = await ClinicianFeedbackModel.find({ summaryId: { $in: summaryIds } });

      let avgClinicianCompleteness: number | null = null;
      let avgClinicianCorrectness: number | null = null;
      let avgClinicianConciseness: number | null = null;
      let avgClinicianOverall: number | null = null;

      if (feedbackDocs.length > 0) {
        avgClinicianCompleteness =
          feedbackDocs.reduce((s, f) => s + f.completenessRating, 0) / feedbackDocs.length;
        avgClinicianCorrectness =
          feedbackDocs.reduce((s, f) => s + f.correctnessRating, 0) / feedbackDocs.length;
        avgClinicianConciseness =
          feedbackDocs.reduce((s, f) => s + f.concisenessRating, 0) / feedbackDocs.length;
        avgClinicianOverall =
          (avgClinicianCompleteness + avgClinicianCorrectness + avgClinicianConciseness) / 3;
      }

      resultsPerBackend.push({
        modelBackend: backendName,
        count,
        avgRouge1: Number(avgRouge1.toFixed(4)),
        avgRouge2: Number(avgRouge2.toFixed(4)),
        avgRougeL: Number(avgRougeL.toFixed(4)),
        avgBertScore: Number(avgBertScore.toFixed(4)),
        avgEntityF1: Number(avgEntityF1.toFixed(4)),
        avgConsistencyScore: Number(avgConsistencyScore.toFixed(4)),
        avgLatencyMs: Number(avgLatencyMs.toFixed(1)),
        avgClinicianCompleteness: avgClinicianCompleteness ? Number(avgClinicianCompleteness.toFixed(2)) : null,
        avgClinicianCorrectness: avgClinicianCorrectness ? Number(avgClinicianCorrectness.toFixed(2)) : null,
        avgClinicianConciseness: avgClinicianConciseness ? Number(avgClinicianConciseness.toFixed(2)) : null,
        avgClinicianOverall: avgClinicianOverall ? Number(avgClinicianOverall.toFixed(2)) : null,
        flaggedClaimRate: Number(flaggedClaimRate.toFixed(4)),
      });
    }

    // 4. Calculate Correlation Statistics across all summaries with clinician feedback
    const evaluationPairs = await getSummaryEvaluationPairs();
    const correlationStats = computeCorrelationStats(evaluationPairs);

    // 5. Build Disagreement Matrix (high ROUGE, low correctness)
    const disagreements: DisagreementCase[] = [];
    for (const pair of evaluationPairs) {
      if (pair.automaticMetrics.rouge1.f1 >= 0.6 && pair.feedback.correctness <= 2) {
        disagreements.push({
          summaryId: pair.summaryId,
          modelBackend: pair.modelBackend,
          docType: pair.docType,
          rouge1F1: pair.automaticMetrics.rouge1.f1,
          bertScoreF1: pair.automaticMetrics.bertScore.f1,
          consistencyScore: pair.consistencyScore,
          humanCorrectness: pair.feedback.correctness,
          disagreementScore: Number((pair.automaticMetrics.rouge1.f1 - pair.feedback.correctness / 5).toFixed(2)),
          reason: 'High ROUGE-1 n-gram overlap, but clinician flagged hallucinated/incorrect claim.',
        });
      }
    }

    // 6. Generate Markdown Report
    const reportMarkdown = generateBenchmarkMarkdownReport({
      runId: benchmarkRun._id.toString(),
      runName,
      createdAt: new Date(),
      documentCount: documents.length,
      backendsEvaluated: modelBackends,
      resultsPerBackend,
      correlationStats,
      disagreements,
    });

    // 7. Save completed BenchmarkRun
    benchmarkRun.status = 'completed';
    benchmarkRun.resultsPerBackend = resultsPerBackend;
    benchmarkRun.correlationStats = correlationStats;
    benchmarkRun.reportMarkdown = reportMarkdown;
    await benchmarkRun.save();

    await AuditLogger.log({
      eventType: 'export',
      payload: {
        action: 'benchmark_run_completed',
        benchmarkRunId: benchmarkRun._id.toString(),
        backendsEvaluated: modelBackends,
        documentCount: documents.length,
      },
    });

    return benchmarkRun;
  } catch (error: unknown) {
    benchmarkRun.status = 'failed';
    benchmarkRun.error = error instanceof Error ? error.message : String(error);
    await benchmarkRun.save();
    throw error;
  }
}

/**
 * Fetches all Summary documents that have paired ClinicianFeedback entries.
 */
export async function getSummaryEvaluationPairs(): Promise<SummaryEvaluationPair[]> {
  const summaries = await SummaryModel.find({
    automaticMetrics: { $ne: null },
  }).lean();

  const pairs: SummaryEvaluationPair[] = [];

  for (const s of summaries) {
    const feedbackList = await ClinicianFeedbackModel.find({ summaryId: s._id }).lean();
    if (feedbackList.length === 0) continue;

    const job = await SummarizationJobModel.findById(s.jobId).lean();
    const doc = job && job.documentIds.length > 0 ? await DocumentModel.findById(job.documentIds[0]).lean() : null;

    const avgCompleteness =
      feedbackList.reduce((acc, f) => acc + f.completenessRating, 0) / feedbackList.length;
    const avgCorrectness =
      feedbackList.reduce((acc, f) => acc + f.correctnessRating, 0) / feedbackList.length;
    const avgConciseness =
      feedbackList.reduce((acc, f) => acc + f.concisenessRating, 0) / feedbackList.length;
    const overall = (avgCompleteness + avgCorrectness + avgConciseness) / 3;

    pairs.push({
      summaryId: s._id.toString(),
      modelBackend: job ? job.modelBackend : 'unknown',
      docType: doc ? doc.docType : 'ehr_note',
      automaticMetrics: s.automaticMetrics as unknown as AutomaticMetrics,
      consistencyScore: s.consistencyScore ?? 1.0,
      feedback: {
        completeness: Number(avgCompleteness.toFixed(2)),
        correctness: Number(avgCorrectness.toFixed(2)),
        conciseness: Number(avgConciseness.toFixed(2)),
        overall: Number(overall.toFixed(2)),
      },
    });
  }

  return pairs;
}
