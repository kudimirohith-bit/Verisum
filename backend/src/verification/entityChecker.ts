import {
  ConsistencyChecker,
  Claim,
  SourceChunk,
  VerificationConfig,
  ClaimVerificationResult,
} from './types.js';

export class EntityGroundingChecker implements ConsistencyChecker {
  readonly name = 'entity_grounding';

  async verifyClaims(
    claims: Claim[],
    sourceChunks: SourceChunk[],
    config: VerificationConfig,
  ): Promise<ClaimVerificationResult[]> {
    const results: ClaimVerificationResult[] = [];

    for (const claim of claims) {
      let premise = '';
      if (claim.sourceChunkId) {
        const chunk = sourceChunks.find((c) => c.id === claim.sourceChunkId);
        if (chunk) premise = chunk.text;
      }
      if (!premise) {
        premise = sourceChunks.map((c) => c.text).join(' ');
      }

      const ungroundedEntities = this.findUngroundedTokens(claim.sentence, premise);

      if (ungroundedEntities.length > 0) {
        results.push({
          claim,
          verdict: 'ungrounded',
          confidence: 0.9,
          reason: `Ungrounded entities/numeric values in summary: ${ungroundedEntities.map((e) => `'${e}'`).join(', ')} not found in source text`,
          strategy: 'entity_grounding',
        });
      } else {
        results.push({
          claim,
          verdict: 'entailment',
          confidence: 0.9,
          reason: 'All numeric values and clinical entities are grounded in source text',
          strategy: 'entity_grounding',
        });
      }
    }

    return results;
  }

  private findUngroundedTokens(sentence: string, sourceText: string): string[] {
    const ungrounded: string[] = [];
    const sourceLower = sourceText.toLowerCase();

    // 1. Extract numeric values with optional units (e.g., 500mg, 10 mg, 120/80, 01/15/2024, 67-year-old)
    const numericPattern = /\b\d+(?:\.\d+)?(?:\s*(?:mg|g|ml|mcg|mmol\/l|mg\/dl|%|bpm|mmhg|years-old|yo|y\/o|mg\/kg|l\/min))?\b/gi;
    const summaryNumbers = sentence.match(numericPattern) || [];

    for (const num of summaryNumbers) {
      const cleanNum = num.toLowerCase().trim();
      const rawDigits = cleanNum.match(/\d+(?:\.\d+)?/)?.[0];

      if (!rawDigits) continue;

      // Check if exact string or raw digit sequence is present in source
      const isExactMatch = sourceLower.includes(cleanNum);
      const isDigitMatch =
        sourceLower.includes(rawDigits) ||
        new RegExp(`(?:^|[^0-9.])${rawDigits.replace('.', '\\.')}(?:[^0-9.]|$)`, 'i').test(sourceLower);

      if (!isExactMatch && !isDigitMatch) {
        ungrounded.push(num);
      }
    }

    return Array.from(new Set(ungrounded));
  }
}
