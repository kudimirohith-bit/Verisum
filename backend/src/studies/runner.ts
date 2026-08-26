import { StudyModel, IStudy } from '../models/Study.js';
import { SummarizationJobModel } from '../models/SummarizationJob.js';
import { SummaryModel } from '../models/Summary.js';
import { ClinicianFeedbackModel } from '../models/ClinicianFeedback.js';

export interface StudyBackendResult {
  modelBackend: string;
  processedDocumentCount: number;
  meanConsistencyScore: number | null;
  meanClinicianOverall: number | null;
  meanCompleteness: number | null;
  meanCorrectness: number | null;
  meanConciseness: number | null;
  flaggedClaimRate: number;
  meanTimeOnTaskSeconds: number | null;
}

export interface StudyResultsReport {
  studyId: string;
  studyName: string;
  description?: string;
  primaryOutcomeMetric: string;
  startDate: Date;
  endDate?: Date;
  enrolledBackends: string[];
  totalJobsEnrolled: number;
  backendResults: StudyBackendResult[];
  markdownReport: string;
}

export async function computeStudyResults(studyId: string): Promise<StudyResultsReport> {
  const study = await StudyModel.findById(studyId);
  if (!study) {
    throw new Error(`Study with ID ${studyId} not found`);
  }

  // Fetch all jobs enrolled under this study
  const jobs = await SummarizationJobModel.find({ studyId: study._id });
  const jobIds = jobs.map((j) => j._id);

  // Fetch all summaries for enrolled jobs
  const summaries = await SummaryModel.find({ jobId: { $in: jobIds } });
  const summaryMap = new Map(summaries.map((s) => [s.jobId.toString(), s]));
  const summaryIds = summaries.map((s) => s._id);

  // Fetch all clinician feedback for enrolled summaries / study
  const feedbacks = await ClinicianFeedbackModel.find({
    $or: [{ studyId: study._id }, { summaryId: { $in: summaryIds } }],
  });

  const feedbackBySummaryId = new Map<string, typeof feedbacks>();
  for (const f of feedbacks) {
    const key = f.summaryId.toString();
    const existing = feedbackBySummaryId.get(key) || [];
    existing.push(f);
    feedbackBySummaryId.set(key, existing);
  }

  // Determine backends to evaluate (enrolled backends or distinct backends from jobs)
  const backendsToEvaluate = Array.from(
    new Set([...study.enrolledBackends, ...jobs.map((j) => j.modelBackend)]),
  );

  const backendResults: StudyBackendResult[] = [];

  for (const backend of backendsToEvaluate) {
    const backendJobs = jobs.filter((j) => j.modelBackend === backend && j.status === 'completed');
    const backendSummaries = backendJobs
      .map((j) => summaryMap.get(j._id.toString()))
      .filter(Boolean);

    const count = backendJobs.length;

    if (count === 0) {
      backendResults.push({
        modelBackend: backend,
        processedDocumentCount: 0,
        meanConsistencyScore: null,
        meanClinicianOverall: null,
        meanCompleteness: null,
        meanCorrectness: null,
        meanConciseness: null,
        flaggedClaimRate: 0,
        meanTimeOnTaskSeconds: null,
      });
      continue;
    }

    // 1. Mean Consistency Score
    const validScores = backendSummaries
      .map((s) => s!.consistencyScore)
      .filter((sc): sc is number => sc !== null && sc !== undefined);
    const meanConsistencyScore =
      validScores.length > 0
        ? Number((validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(3))
        : null;

    // 2. Flagged Claim Rate
    const flaggedJobs = backendSummaries.filter(
      (s) => s!.flaggedClaims && s!.flaggedClaims.length > 0,
    ).length;
    const flaggedClaimRate = Number((flaggedJobs / count).toFixed(3));

    // 3. Clinician Feedback & Time-on-Task
    const backendFeedbackList: typeof feedbacks = [];
    for (const s of backendSummaries) {
      const fb = feedbackBySummaryId.get(s!._id.toString()) || [];
      backendFeedbackList.push(...fb);
    }

    let meanClinicianOverall: number | null = null;
    let meanCompleteness: number | null = null;
    let meanCorrectness: number | null = null;
    let meanConciseness: number | null = null;
    let meanTimeOnTaskSeconds: number | null = null;

    if (backendFeedbackList.length > 0) {
      const comp = backendFeedbackList.reduce((a, b) => a + b.completenessRating, 0);
      const corr = backendFeedbackList.reduce((a, b) => a + b.correctnessRating, 0);
      const conc = backendFeedbackList.reduce((a, b) => a + b.concisenessRating, 0);
      const len = backendFeedbackList.length;

      meanCompleteness = Number((comp / len).toFixed(2));
      meanCorrectness = Number((corr / len).toFixed(2));
      meanConciseness = Number((conc / len).toFixed(2));
      meanClinicianOverall = Number(((comp + corr + conc) / (3 * len)).toFixed(2));

      // Time on task in seconds
      const validTimes = backendFeedbackList
        .map((f) => f.timeOnTaskMs)
        .filter((t): t is number => t !== undefined && t !== null && t > 0);
      if (validTimes.length > 0) {
        const avgMs = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
        meanTimeOnTaskSeconds = Number((avgMs / 1000).toFixed(1));
      }
    }

    backendResults.push({
      modelBackend: backend,
      processedDocumentCount: count,
      meanConsistencyScore,
      meanClinicianOverall,
      meanCompleteness,
      meanCorrectness,
      meanConciseness,
      flaggedClaimRate,
      meanTimeOnTaskSeconds,
    });
  }

  // Format Markdown Export
  const markdownReport = generateStudyMarkdownReport(study, backendResults, jobs.length);

  return {
    studyId: study._id.toString(),
    studyName: study.name,
    description: study.description,
    primaryOutcomeMetric: study.primaryOutcomeMetric,
    startDate: study.startDate,
    endDate: study.endDate,
    enrolledBackends: study.enrolledBackends,
    totalJobsEnrolled: jobs.length,
    backendResults,
    markdownReport,
  };
}

function generateStudyMarkdownReport(
  study: IStudy,
  results: StudyBackendResult[],
  totalJobs: number,
): string {
  const lines: string[] = [];

  lines.push(`# VeriSum Prospective Evaluation Study Report: ${study.name}`);
  lines.push(`**Study ID:** \`${study._id.toString()}\`  `);
  lines.push(`**Primary Outcome Metric:** ${study.primaryOutcomeMetric}  `);
  lines.push(`**Start Date:** ${new Date(study.startDate).toISOString().split('T')[0]}  `);
  lines.push(`**Total Enrolled Summarization Jobs:** ${totalJobs}  `);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 1. Outcomes by Model Backend');
  lines.push('');
  lines.push('| Backend | Count | Mean Consistency | Mean Clinician Overall | Correctness | Completeness | Conciseness | Time-on-Task (s) | Flagged Rate |');
  lines.push('|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|');

  for (const r of results) {
    const cons = r.meanConsistencyScore !== null ? r.meanConsistencyScore.toFixed(3) : 'N/A';
    const overall = r.meanClinicianOverall !== null ? `${r.meanClinicianOverall.toFixed(2)} / 5.0` : 'N/A';
    const corr = r.meanCorrectness !== null ? `${r.meanCorrectness.toFixed(2)}` : 'N/A';
    const comp = r.meanCompleteness !== null ? `${r.meanCompleteness.toFixed(2)}` : 'N/A';
    const conc = r.meanConciseness !== null ? `${r.meanConciseness.toFixed(2)}` : 'N/A';
    const tot = r.meanTimeOnTaskSeconds !== null ? `${r.meanTimeOnTaskSeconds.toFixed(1)}s` : 'N/A';
    const flag = `${(r.flaggedClaimRate * 100).toFixed(1)}%`;

    lines.push(`| **${r.modelBackend}** | ${r.processedDocumentCount} | ${cons} | ${overall} | ${corr} | ${comp} | ${conc} | ${tot} | ${flag} |`);
  }

  lines.push('');
  lines.push('## 2. Study Methodology & Governance Notes');
  lines.push('');
  lines.push('- **Time-on-Task Instrumentation**: Recorded elapsed time between clinician summary view mount and feedback submission. Represents an approximation for exploratory efficiency analysis.');
  lines.push('- **IRB & Blinding Disclaimer**: Ensure clinician evaluation blinding and Institutional Review Board (IRB) ethical compliance in accordance with `docs/prospective-study-guide.md`.');

  return lines.join('\n');
}
