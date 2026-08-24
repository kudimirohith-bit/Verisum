"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationPipeline = void 0;
const splitter_js_1 = require("../chunking/splitter.js");
const config_js_1 = require("./config.js");
const nliChecker_js_1 = require("./nliChecker.js");
const entityChecker_js_1 = require("./entityChecker.js");
const llmJudgeChecker_js_1 = require("./llmJudgeChecker.js");
class VerificationPipeline {
    checkers = {
        nli: new nliChecker_js_1.NLIConsistencyChecker(),
        entity_grounding: new entityChecker_js_1.EntityGroundingChecker(),
        llm_judge: new llmJudgeChecker_js_1.LLMJudgeChecker(),
    };
    /**
     * Run multi-strategy verification pipeline over a summary text against source chunks.
     */
    async verify(summaryText, sourceChunks, docType = 'ehr_note') {
        if (!summaryText || !summaryText.trim()) {
            return {
                consistencyScore: 1.0,
                flaggedClaims: [],
                claimResults: [],
            };
        }
        const config = (0, config_js_1.getVerificationConfig)(docType);
        // 1. Break summary into claims (sentences) and track offsets
        const sentenceStrings = (0, splitter_js_1.splitSentences)(summaryText);
        const claims = [];
        let currentOffset = 0;
        for (const sentence of sentenceStrings) {
            const startOffset = summaryText.indexOf(sentence, currentOffset);
            const endOffset = startOffset >= 0 ? startOffset + sentence.length : currentOffset + sentence.length;
            if (startOffset >= 0) {
                currentOffset = endOffset;
            }
            // Map to source chunk if sentence matches source chunk reference or default to first chunk
            const sourceChunkId = sourceChunks.length > 0 ? sourceChunks[0].id : undefined;
            claims.push({
                sentence,
                startOffset: Math.max(0, startOffset),
                endOffset: Math.max(0, endOffset),
                sourceChunkId,
            });
        }
        if (claims.length === 0) {
            return {
                consistencyScore: 1.0,
                flaggedClaims: [],
                claimResults: [],
            };
        }
        // 2. Execute configured active verification strategies
        const claimResults = [];
        const activeStrategies = config.activeStrategies || ['nli', 'entity_grounding'];
        for (const strategyKey of activeStrategies) {
            const checker = this.checkers[strategyKey];
            if (checker) {
                const res = await checker.verifyClaims(claims, sourceChunks, config);
                claimResults.push(...res);
            }
        }
        // 3. Aggregate results per claim
        const flaggedClaimsMap = new Map();
        for (const claim of claims) {
            const evalResults = claimResults.filter((r) => r.claim.sentence === claim.sentence);
            // Find worst verdict: contradiction / ungrounded > neutral > entailment
            const contradiction = evalResults.find((r) => r.verdict === 'contradiction');
            const ungrounded = evalResults.find((r) => r.verdict === 'ungrounded');
            const neutral = evalResults.find((r) => r.verdict === 'neutral');
            const worst = contradiction || ungrounded || neutral;
            if (worst) {
                const flaggedEntry = {
                    claimText: claim.sentence,
                    startOffset: claim.startOffset,
                    endOffset: claim.endOffset,
                    sentence: claim.sentence,
                    sourceChunkId: claim.sourceChunkId,
                    verdict: worst.verdict,
                    confidence: worst.confidence,
                    reason: worst.reason,
                };
                flaggedClaimsMap.set(claim.sentence, flaggedEntry);
            }
        }
        const flaggedClaims = Array.from(flaggedClaimsMap.values());
        const totalClaims = claims.length;
        const flaggedCount = flaggedClaims.length;
        // Calculate consistency score between 0.0 and 1.0
        const rawScore = (totalClaims - flaggedCount) / totalClaims;
        const consistencyScore = Math.max(0.0, Math.min(1.0, Number(rawScore.toFixed(2))));
        return {
            consistencyScore,
            flaggedClaims,
            claimResults,
        };
    }
}
exports.VerificationPipeline = VerificationPipeline;
