/**
 * CLI Benchmarking Wrapper Script — backend/scripts/runBenchmark.ts
 *
 * Runs an offline batch research benchmark study across model backends,
 * evaluates automatic NLP metrics and clinician correlations, and outputs
 * a Markdown benchmark report.
 *
 * Usage:
 *   npx tsx scripts/runBenchmark.ts
 *   npm run benchmark
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { runBenchmarkSuite, getSummaryEvaluationPairs } from '../src/benchmark/runner.js';
import { DocumentModel } from '../src/models/Document.js';
import { UserModel } from '../src/models/User.js';
import { SummaryModel } from '../src/models/Summary.js';
import { ClinicianFeedbackModel } from '../src/models/ClinicianFeedback.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/verisumm';

async function main() {
  console.log('===============================================================');
  console.log(' VeriSumm Benchmarking Harness — Batch Evaluation Script');
  console.log('===============================================================\n');

  console.log(`[CLI Benchmark] Connecting to MongoDB at ${MONGODB_URI}...`);
  await mongoose.connect(MONGODB_URI);
  console.log('[CLI Benchmark] Connected to MongoDB.');

  // 1. Verify / Seed Demo Data if Database is Empty
  let documents = await DocumentModel.find({});
  if (documents.length === 0) {
    console.log('[CLI Benchmark] No documents found. Seeding synthetic demo documents...');

    let admin = await UserModel.findOne({ role: 'admin' });
    if (!admin) {
      admin = await UserModel.create({
        email: 'cli_admin@verisumm.io',
        passwordHash: 'hash',
        role: 'admin',
      });
    }

    const doc1 = await DocumentModel.create({
      ownerId: admin._id,
      docType: 'ehr_note',
      rawText: 'Patient is a 65-year-old male presenting with chest pain, dyspnea, and blood pressure 150/95. ECG shows sinus tachycardia. Administered Nitroglycerin 0.4mg sublingually and Aspirin 325mg.',
      sourceFilename: 'ehr_note_demo.txt',
      phiStatus: 'deidentified',
      uploadedAt: new Date(),
    });

    const doc2 = await DocumentModel.create({
      ownerId: admin._id,
      docType: 'discharge_summary',
      rawText: 'Discharge Summary: 54yo female admitted for acute gallbladder disease. Laparoscopic cholecystectomy performed on 08/12/2024 without complication. Prescribed Amoxicillin 500mg TID and Acetaminophen as needed.',
      sourceFilename: 'discharge_summary_demo.txt',
      phiStatus: 'deidentified',
      uploadedAt: new Date(),
    });

    documents = [doc1, doc2];
    console.log(`[CLI Benchmark] Created ${documents.length} demo documents.`);
  }

  // Seed synthetic clinician feedback if < 10 entries exist
  const existingFeedback = await ClinicianFeedbackModel.countDocuments();
  if (existingFeedback < 10) {
    console.log('[CLI Benchmark] Seeding synthetic clinician feedback documents for correlation analysis...');
    let clinician = await UserModel.findOne({ role: 'clinician' });
    if (!clinician) {
      clinician = await UserModel.create({
        email: 'cli_clinician@verisumm.io',
        passwordHash: 'hash',
        role: 'clinician',
      });
    }

    const summaries = await SummaryModel.find({});
    for (let i = 0; i < 30; i++) {
      const summary = summaries.length > 0 ? summaries[i % summaries.length] : null;
      if (summary) {
        const isGood = i % 3 === 0;
        try {
          // Generate synthetic distinct reviewer ID per loop to avoid index conflicts
          const synthReviewerId = new mongoose.Types.ObjectId();
          await ClinicianFeedbackModel.create({
            summaryId: summary._id,
            reviewerId: synthReviewerId,
            completenessRating: isGood ? 4 + (i % 2) : 2 + (i % 3),
            correctnessRating: isGood ? 4 + (i % 2) : 2 + (i % 3),
            concisenessRating: 3 + (i % 3),
            comment: `Synthetic feedback #${i + 1}`,
          });
        } catch {
          // Ignore duplicate pair
        }
      }
    }
    console.log('[CLI Benchmark] Synthetic feedback seeded.');
  }

  // 2. Execute Benchmark Suite
  console.log('\n[CLI Benchmark] Executing benchmark suite across backends [mock, local_clinical_model, hosted_llm]...');
  const run = await runBenchmarkSuite({
    name: 'CLI Research Study Run',
    modelBackends: ['mock', 'local_clinical_model', 'hosted_llm'],
  });

  console.log('\n===============================================================');
  console.log(' BENCHMARK EVALUATION RESULTS PER BACKEND');
  console.log('===============================================================');

  for (const b of run.resultsPerBackend) {
    console.log(`\nBackend: ${b.modelBackend.toUpperCase()}`);
    console.log(`  - Evaluated Documents: ${b.count}`);
    console.log(`  - ROUGE-1 (F1):        ${b.avgRouge1.toFixed(4)}`);
    console.log(`  - ROUGE-2 (F1):        ${b.avgRouge2.toFixed(4)}`);
    console.log(`  - ROUGE-L (F1):        ${b.avgRougeL.toFixed(4)}`);
    console.log(`  - BERTScore (F1):      ${b.avgBertScore.toFixed(4)}`);
    console.log(`  - Entity Grounding F1: ${b.avgEntityF1.toFixed(4)}`);
    console.log(`  - NLI Consistency:     ${b.avgConsistencyScore.toFixed(4)}`);
    console.log(`  - Clinician Rating:    ${b.avgClinicianOverall ? `${b.avgClinicianOverall.toFixed(2)} / 5` : 'N/A'}`);
    console.log(`  - Latency:             ${b.avgLatencyMs.toFixed(1)} ms`);
    console.log(`  - Flagged Claim Rate:  ${(b.flaggedClaimRate * 100).toFixed(1)}%`);
  }

  console.log('\n===============================================================');
  console.log(' AUTOMATIC METRICS VS. CLINICIAN CORRELATION (Pearson / Spearman)');
  console.log('===============================================================');

  for (const c of run.correlationStats) {
    console.log(`  Metric: ${c.metricName.padEnd(16)} | Human: ${c.humanDimension.padEnd(12)} | Pearson r: ${c.pearsonR.toFixed(3).padStart(6)} | Spearman ρ: ${c.spearmanRho.toFixed(3).padStart(6)} | ${c.interpretation}`);
  }

  // 3. Save Report to Disk
  const outputPath = path.join(process.cwd(), 'benchmark_report.md');
  fs.writeFileSync(outputPath, run.reportMarkdown || '');
  console.log(`\n[CLI Benchmark] Benchmark report saved to: ${outputPath}`);

  await mongoose.disconnect();
  console.log('[CLI Benchmark] Disconnected from MongoDB. Benchmark completed successfully.');
}

main().catch((err) => {
  console.error('[CLI Benchmark Error]', err);
  process.exit(1);
});
