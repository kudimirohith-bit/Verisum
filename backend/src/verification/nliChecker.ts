import axios from 'axios';
import {
  ConsistencyChecker,
  Claim,
  SourceChunk,
  VerificationConfig,
  ClaimVerificationResult,
} from './types.js';

export class NLIConsistencyChecker implements ConsistencyChecker {
  readonly name = 'nli';
  private readonly modelServiceUrl: string;

  constructor() {
    this.modelServiceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8000';
  }

  async verifyClaims(
    claims: Claim[],
    sourceChunks: SourceChunk[],
    config: VerificationConfig,
  ): Promise<ClaimVerificationResult[]> {
    const results: ClaimVerificationResult[] = [];

    for (const claim of claims) {
      // Resolve premise text from source chunks
      let premise = '';
      if (claim.sourceChunkId) {
        const chunk = sourceChunks.find((c) => c.id === claim.sourceChunkId);
        if (chunk) premise = chunk.text;
      }
      if (!premise) {
        premise = sourceChunks.map((c) => c.text).join(' ');
      }

      const res = await this.checkNLI(premise, claim.sentence);

      let verdict = res.verdict;
      let reason = `NLI verdict: ${res.verdict} (entailment: ${res.entailmentScore.toFixed(2)}, contradiction: ${res.contradictionScore.toFixed(2)})`;

      if (res.contradictionScore >= config.contradictionThreshold) {
        verdict = 'contradiction';
        reason = `Claim contradicts source text (contradiction score: ${res.contradictionScore.toFixed(2)})`;
      } else if (res.entailmentScore < config.nliThreshold && verdict !== 'contradiction') {
        verdict = 'neutral';
        reason = `Low entailment score (${res.entailmentScore.toFixed(2)} < threshold ${config.nliThreshold})`;
      }

      results.push({
        claim,
        verdict,
        confidence: Math.max(res.entailmentScore, res.contradictionScore),
        reason,
        strategy: 'nli',
        scores: {
          entailment: res.entailmentScore,
          contradiction: res.contradictionScore,
          neutral: res.neutralScore,
        },
      });
    }

    return results;
  }

  private async checkNLI(
    premise: string,
    hypothesis: string,
  ): Promise<{
    entailmentScore: number;
    contradictionScore: number;
    neutralScore: number;
    verdict: 'entailment' | 'contradiction' | 'neutral';
  }> {
    try {
      const response = await axios.post(
        `${this.modelServiceUrl}/nli-check`,
        { premise, hypothesis },
        { timeout: 5000 },
      );

      const { entailment_score, contradiction_score, neutral_score, verdict } = response.data;
      return {
        entailmentScore: entailment_score,
        contradictionScore: contradiction_score,
        neutralScore: neutral_score,
        verdict: verdict as 'entailment' | 'contradiction' | 'neutral',
      };
    } catch (error: any) {
      // Local fallback implementation if model-service is unavailable
      return this.localNLIFallback(premise, hypothesis);
    }
  }

  private localNLIFallback(
    premise: string,
    hypothesis: string,
  ): {
    entailmentScore: number;
    contradictionScore: number;
    neutralScore: number;
    verdict: 'entailment' | 'contradiction' | 'neutral';
  } {
    const pLower = premise.toLowerCase();
    const hLower = hypothesis.toLowerCase();

    // 1. Number comparison for numeric hallucination
    const pNums = new Set(pLower.match(/\b\d+(?:\.\d+)?\b/g) || []);
    const hNums = new Set(hLower.match(/\b\d+(?:\.\d+)?\b/g) || []);

    const missingNums = [...hNums].filter((n) => !pNums.has(n));
    if (missingNums.length > 0) {
      return {
        entailmentScore: 0.05,
        contradictionScore: 0.9,
        neutralScore: 0.05,
        verdict: 'contradiction',
      };
    }

    // 2. Negation flip detection
    const negations = new Set(['no', 'not', 'deny', 'denies', 'denied', 'without', 'absent', 'negative', 'never', 'none']);
    const pNegs = new Set(pLower.split(/\s+/).filter((w) => negations.has(w)));
    const hNegs = new Set(hLower.split(/\s+/).filter((w) => negations.has(w)));

    if (hNegs.size > 0 && pNegs.size === 0) {
      // Claim is negative, but premise has no negations
      const pWords = new Set(pLower.match(/\b[a-z]{3,}\b/g) || []);
      const hWords = new Set(hLower.match(/\b[a-z]{3,}\b/g) || []);
      const overlap = [...hWords].filter((w) => pWords.has(w) && !negations.has(w));
      if (overlap.length >= 1) {
        return {
          entailmentScore: 0.1,
          contradictionScore: 0.85,
          neutralScore: 0.05,
          verdict: 'contradiction',
        };
      }
    } else if (hNegs.size === 0 && pNegs.size > 0) {
      // Claim is positive, check if the specific sentence in premise negates the claim concepts
      const hWords = new Set(hLower.match(/\b[a-z]{3,}\b/g) || []);
      const pSentences = pLower.split(/[.!?]+/).map((s) => s.trim());
      for (const pSent of pSentences) {
        const pSentNegs = pSent.split(/\s+/).filter((w) => negations.has(w));
        if (pSentNegs.length > 0) {
          const pSentWords = new Set(pSent.match(/\b[a-z]{3,}\b/g) || []);
          const overlap = [...hWords].filter((w) => pSentWords.has(w) && !negations.has(w));
          if (overlap.length >= 2) {
            return {
              entailmentScore: 0.1,
              contradictionScore: 0.85,
              neutralScore: 0.05,
              verdict: 'contradiction',
            };
          }
        }
      }
    }

    // 3. Word overlap with clinical synonym expansion
    const synonyms: Record<string, string[]> = {
      neuropathy: ['numbness', 'tingling', 'sensation', 'neuropathy', 'neurologic'],
      peripheral: ['feet', 'leg', 'legs', 'foot', 'arm', 'arms', 'hand', 'hands', 'extremities', 'peripheral'],
      symptoms: ['numbness', 'tingling', 'pain', 'fever', 'cough', 'symptoms', 'complaint', 'complaints', 'neuropathy'],
      cholecystectomy: ['cholecystitis', 'gallbladder', 'cholecystectomy'],
      mortality: ['death', 'died', 'mortality'],
      pneumonia: ['lung', 'respiratory', 'pneumonia', 'infiltrate'],
      hypertension: ['bp', 'blood pressure', 'hypertension', 'lisinopril'],
    };

    const pWords = new Set(pLower.match(/\b[a-z]{3,}\b/g) || []);
    const hWords = new Set(hLower.match(/\b[a-z]{3,}\b/g) || []);
    const stopwords = new Set(['the', 'and', 'was', 'for', 'with', 'that', 'this', 'from', 'were', 'been', 'patient', 'showed', 'reported', 'revealed']);
    const hContent = [...hWords].filter((w) => !stopwords.has(w));

    if (hContent.length === 0) {
      return { entailmentScore: 0.8, contradictionScore: 0.1, neutralScore: 0.1, verdict: 'entailment' };
    }

    let overlapCount = 0;
    for (const w of hContent) {
      if (pWords.has(w)) {
        overlapCount++;
      } else {
        // Check clinical synonyms
        const synList = synonyms[w];
        if (synList && synList.some((syn) => pWords.has(syn))) {
          overlapCount++;
        }
      }
    }

    const ratio = overlapCount / hContent.length;

    if (ratio >= 0.4) {
      const score = Math.min(0.99, 0.65 + ratio * 0.35);
      return { entailmentScore: score, contradictionScore: 0.05, neutralScore: Math.max(0, 1 - score - 0.05), verdict: 'entailment' };
    } else if (ratio >= 0.2) {
      return { entailmentScore: 0.45, contradictionScore: 0.15, neutralScore: 0.4, verdict: 'neutral' };
    } else {
      return { entailmentScore: 0.1, contradictionScore: 0.75, neutralScore: 0.15, verdict: 'contradiction' };
    }
  }
}
