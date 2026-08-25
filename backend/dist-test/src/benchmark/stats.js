"use strict";
/**
 * Statistical Correlation Helper — backend/src/benchmark/stats.ts
 *
 * Implements Pearson (r) and Spearman rank (ρ) correlation coefficients
 * to study how automatic metrics relate to clinician ratings across summaries.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pearsonCorrelation = pearsonCorrelation;
exports.getRanks = getRanks;
exports.spearmanCorrelation = spearmanCorrelation;
exports.interpretCorrelation = interpretCorrelation;
exports.computeCorrelationStats = computeCorrelationStats;
/**
 * Calculates Pearson Correlation Coefficient (r) between arrays x and y.
 */
function pearsonCorrelation(x, y) {
    const n = x.length;
    if (n < 2)
        return 0;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }
    if (denX === 0 || denY === 0)
        return 0;
    return Number((num / Math.sqrt(denX * denY)).toFixed(4));
}
/**
 * Calculates ranks for an array of numbers, handling ties with fractional ranks.
 */
function getRanks(arr) {
    const indexed = arr.map((val, idx) => ({ val, idx }));
    indexed.sort((a, b) => a.val - b.val);
    const ranks = new Array(arr.length);
    let i = 0;
    while (i < indexed.length) {
        let j = i;
        while (j < indexed.length && indexed[j].val === indexed[i].val) {
            j++;
        }
        const averageRank = (i + 1 + j) / 2;
        for (let k = i; k < j; k++) {
            ranks[indexed[k].idx] = averageRank;
        }
        i = j;
    }
    return ranks;
}
/**
 * Calculates Spearman Rank Correlation Coefficient (ρ) between arrays x and y.
 */
function spearmanCorrelation(x, y) {
    if (x.length < 2)
        return 0;
    const rankX = getRanks(x);
    const rankY = getRanks(y);
    return pearsonCorrelation(rankX, rankY);
}
/**
 * Provides a textual interpretation of correlation values.
 */
function interpretCorrelation(r) {
    const abs = Math.abs(r);
    const dir = r >= 0 ? 'Positive' : 'Negative';
    if (abs >= 0.7)
        return `Strong ${dir} Correlation`;
    if (abs >= 0.4)
        return `Moderate ${dir} Correlation`;
    if (abs >= 0.2)
        return `Weak ${dir} Correlation`;
    return 'Negligible / No Correlation';
}
/**
 * Computes correlation statistics across all metric vs human judgment dimensions.
 */
function computeCorrelationStats(pairs) {
    if (pairs.length === 0)
        return [];
    const metricsMap = {
        rouge1_f1: (p) => p.automaticMetrics.rouge1?.f1 ?? 0,
        rouge2_f1: (p) => p.automaticMetrics.rouge2?.f1 ?? 0,
        rougeL_f1: (p) => p.automaticMetrics.rougeL?.f1 ?? 0,
        bertScore_f1: (p) => p.automaticMetrics.bertScore?.f1 ?? 0,
        entityF1: (p) => p.automaticMetrics.entityF1 ?? 0,
        consistencyScore: (p) => p.consistencyScore ?? 0,
    };
    const humanMap = {
        completeness: (p) => p.feedback.completeness,
        correctness: (p) => p.feedback.correctness,
        conciseness: (p) => p.feedback.conciseness,
        overall: (p) => p.feedback.overall,
    };
    const results = [];
    for (const [metricKey, getMetric] of Object.entries(metricsMap)) {
        for (const [humanKey, getHuman] of Object.entries(humanMap)) {
            const xVals = pairs.map(getMetric);
            const yVals = pairs.map(getHuman);
            const r = pearsonCorrelation(xVals, yVals);
            const rho = spearmanCorrelation(xVals, yVals);
            results.push({
                metricName: metricKey,
                humanDimension: humanKey,
                sampleSize: pairs.length,
                pearsonR: r,
                spearmanRho: rho,
                interpretation: interpretCorrelation(r),
            });
        }
    }
    return results;
}
