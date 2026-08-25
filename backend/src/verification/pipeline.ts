import { splitSentences } from '../chunking/splitter.js';
import { IFlaggedClaim } from '../models/Summary.js';
import {
  Claim,
  SourceChunk,
  VerificationResult,
  ClaimVerificationResult,
  ConsistencyChecker,
} from './types.js';
import { getVerificationConfig } from './config.js';
import { NLIConsistencyChecker } from './nliChecker.js';
import { EntityGroundingChecker } from './entityChecker.js';
import { LLMJudgeChecker } from './llmJudgeChecker.js';

export class VerificationPipeline {
  private checkers: Record<string, ConsistencyChecker> = {
    nli: new NLIConsistencyChecker(),
    entity_grounding: new EntityGroundingChecker(),
    llm_judge: new LLMJudgeChecker(),
  };

  /**
   * Run multi-strategy verification pipeline over a summary text against source chunks.
   */
  async verify(
    summaryText: string,
    sourceChunks: SourceChunk[],
    docType: string = 'ehr_note',
  ): Promise<VerificationResult> {
    if (!summaryText || !summaryText.trim()) {
      return {
        consistencyScore: 1.0,
        flaggedClaims: [],
        claimResults: [],
      };
    }

    const config = getVerificationConfig(docType);

    // 1. Break summary into claims (sentences) and track offsets
    const sentenceStrings = splitSentences(summaryText);
    const claims: Claim[] = [];
    let currentOffset = 0;

    for (const sentence of sentenceStrings) {
      const startOffset = summaryText.indexOf(sentence, currentOffset);
      const endOffset = startOffset >= 0 ? startOffset + sentence.length : currentOffset + sentence.length;
      if (startOffset >= 0) {
        currentOffset = endOffset;
      }

      // Best matching source chunk based on word overlap
      let bestChunk: SourceChunk | undefined = sourceChunks[0];
      let maxOverlap = -1;

      const sentenceWords = new Set(sentence.toLowerCase().split(/\W+/).filter(Boolean));
      for (const chunk of sourceChunks) {
        const chunkWords = chunk.text.toLowerCase().split(/\W+/).filter(Boolean);
        let overlap = 0;
        for (const w of chunkWords) {
          if (sentenceWords.has(w)) overlap++;
        }
        if (overlap > maxOverlap) {
          maxOverlap = overlap;
          bestChunk = chunk;
        }
      }

      const sourceChunkId = bestChunk ? bestChunk.id : undefined;
      const sourceDocumentId = bestChunk ? (bestChunk.docId || bestChunk.id) : undefined;
      const sourceFilename = bestChunk ? bestChunk.sourceFilename : undefined;

      claims.push({
        sentence,
        startOffset: Math.max(0, startOffset),
        endOffset: Math.max(0, endOffset),
        sourceChunkId,
        sourceDocumentId,
        sourceFilename,
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
    const claimResults: ClaimVerificationResult[] = [];
    const activeStrategies = config.activeStrategies || ['nli', 'entity_grounding'];

    for (const strategyKey of activeStrategies) {
      const checker = this.checkers[strategyKey];
      if (checker) {
        const res = await checker.verifyClaims(claims, sourceChunks, config);
        claimResults.push(...res);
      }
    }

    // 3. Aggregate results per claim
    const flaggedClaimsMap = new Map<string, IFlaggedClaim>();

    for (const claim of claims) {
      const evalResults = claimResults.filter((r) => r.claim.sentence === claim.sentence);

      // Find worst verdict: contradiction / ungrounded > neutral > entailment
      const contradiction = evalResults.find((r) => r.verdict === 'contradiction');
      const ungrounded = evalResults.find((r) => r.verdict === 'ungrounded');
      const neutral = evalResults.find((r) => r.verdict === 'neutral');

      const worst = contradiction || ungrounded || neutral;

      if (worst) {
        const flaggedEntry: IFlaggedClaim = {
          claimText: claim.sentence,
          startOffset: claim.startOffset,
          endOffset: claim.endOffset,
          sentence: claim.sentence,
          sourceChunkId: claim.sourceChunkId,
          sourceDocumentId: claim.sourceDocumentId,
          sourceFilename: claim.sourceFilename,
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
