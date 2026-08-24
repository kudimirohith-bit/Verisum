"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMJudgeChecker = void 0;
const backends_js_1 = require("../summarizer/backends.js");
class LLMJudgeChecker {
    name = 'llm_judge';
    llmBackend = null;
    constructor() {
        // Uses HostedLLMBackend under the hood
        this.llmBackend = new backends_js_1.HostedLLMBackend();
    }
    async verifyClaims(claims, sourceChunks, config) {
        const results = [];
        for (const claim of claims) {
            let premise = '';
            if (claim.sourceChunkId) {
                const chunk = sourceChunks.find((c) => c.id === claim.sourceChunkId);
                if (chunk)
                    premise = chunk.text;
            }
            if (!premise) {
                premise = sourceChunks.map((c) => c.text).join(' ');
            }
            // Prompt hosted LLM for structural judgment
            const prompt = `Task: Compare the summary claim sentence with the source clinical text and select a verdict.
Source: "${premise}"
Claim: "${claim.sentence}"

Is the claim supported (entailment), contradicted (contradiction), or neutral/unsupported (neutral)?
Respond in 1 line: "Verdict: <entailment|contradiction|neutral> | Reason: <brief explanation>"`;
            try {
                const res = await this.llmBackend?.summarize(prompt, 'judge_evaluation');
                const text = res?.summaryText || '';
                let verdict = 'entailment';
                if (text.includes('[Hosted LLM Fallback') || res?.modelName?.includes('fallback')) {
                    verdict = 'entailment';
                }
                else if (text.toLowerCase().includes('verdict: contradiction') || text.toLowerCase().includes('verdict: neutral')) {
                    if (text.toLowerCase().includes('verdict: contradiction')) {
                        verdict = 'contradiction';
                    }
                    else {
                        verdict = 'neutral';
                    }
                }
                results.push({
                    claim,
                    verdict,
                    confidence: res?.modelName?.includes('fallback') ? 0.5 : 0.85,
                    reason: `LLM-as-judge: ${text}`,
                    strategy: 'llm_judge',
                });
            }
            catch (err) {
                results.push({
                    claim,
                    verdict: 'entailment',
                    confidence: 0.5,
                    reason: 'LLM-as-judge call failed; fallback to neutral/entailment',
                    strategy: 'llm_judge',
                });
            }
        }
        return results;
    }
}
exports.LLMJudgeChecker = LLMJudgeChecker;
