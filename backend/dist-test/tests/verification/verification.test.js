"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../../src/verification/index");
const benchmarkData_1 = require("./benchmarkData");
describe('Verification & Hallucination Detection Benchmark Suite (0.7)', () => {
    const pipeline = new index_1.VerificationPipeline();
    it('runs 20-pair synthetic benchmark and reports precision/recall metrics', async () => {
        let tp = 0; // Unfaithful and flagged
        let fp = 0; // Faithful but flagged
        let tn = 0; // Faithful and not flagged
        let fn = 0; // Unfaithful but not flagged
        console.log('\n--- VERISUMM VERIFICATION BENCHMARK REPORT ---');
        console.log('| ID | DocType | Expected | Detected | Flagged Count | Consistency Score | Status |');
        console.log('|---|---|---|---|---|---|---|');
        for (const pair of benchmarkData_1.benchmarkDataset) {
            const sourceChunks = [{ id: pair.id, text: pair.sourceText }];
            const result = await pipeline.verify(pair.summaryText, sourceChunks, pair.docType);
            const isFlagged = result.flaggedClaims.length > 0;
            const expectedFlagged = !pair.isFaithful;
            if (expectedFlagged && isFlagged) {
                tp++;
            }
            else if (!expectedFlagged && isFlagged) {
                fp++;
            }
            else if (!expectedFlagged && !isFlagged) {
                tn++;
            }
            else if (expectedFlagged && !isFlagged) {
                fn++;
            }
            const matchStatus = isFlagged === expectedFlagged ? 'PASS ✅' : 'FAIL ❌';
            console.log(`| ${pair.id} | ${pair.docType} | ${pair.isFaithful ? 'Faithful' : 'Hallucinated'} | ${isFlagged ? 'Flagged' : 'Clean'} | ${result.flaggedClaims.length} | ${result.consistencyScore} | ${matchStatus} |`);
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        console.log('\n--- BENCHMARK METRICS SUMMARY ---');
        console.log(`True Positives (TP):  ${tp}`);
        console.log(`False Positives (FP): ${fp}`);
        console.log(`True Negatives (TN):  ${tn}`);
        console.log(`False Negatives (FN): ${fn}`);
        console.log(`Precision:            ${(precision * 100).toFixed(1)}%`);
        console.log(`Recall:               ${(recall * 100).toFixed(1)}%`);
        console.log(`F1 Score:             ${(f1 * 100).toFixed(1)}%`);
        console.log('-----------------------------------\n');
        // Acceptance Criteria: High precision and recall on clinical hallucination detection
        expect(precision).toBeGreaterThanOrEqual(0.8);
        expect(recall).toBeGreaterThanOrEqual(0.8);
        expect(f1).toBeGreaterThanOrEqual(0.8);
    });
    it('correctly flags an injected fabricated drug dosage with ungrounded/contradiction verdict', async () => {
        const source = 'Patient is prescribed Lisinopril 10mg daily for hypertension.';
        const hallucinatedSummary = 'Patient is prescribed Lisinopril 40mg daily for hypertension.';
        const res = await pipeline.verify(hallucinatedSummary, [{ id: 'doc1', text: source }], 'ehr_note');
        expect(res.flaggedClaims.length).toBeGreaterThan(0);
        expect(res.consistencyScore).toBeLessThan(1.0);
        const flagged = res.flaggedClaims[0];
        expect(['contradiction', 'ungrounded']).toContain(flagged.verdict);
    });
    it('returns consistencyScore = 1.0 and empty flaggedClaims for a completely faithful summary', async () => {
        const source = 'Patient presented with mild fever and sore throat. Strep test was positive.';
        const faithfulSummary = 'Patient presented with mild fever and sore throat with positive strep test.';
        const res = await pipeline.verify(faithfulSummary, [{ id: 'doc1', text: source }], 'ehr_note');
        expect(res.flaggedClaims.length).toBe(0);
        expect(res.consistencyScore).toBe(1.0);
    });
});
