import { IFlaggedClaim } from '../models/Summary.js';

export type VerificationVerdict = 'entailment' | 'contradiction' | 'neutral' | 'ungrounded';

export interface SourceChunk {
  id: string;
  text: string;
  docId?: string;
  sourceFilename?: string;
  sentenceRange?: [number, number];
}

export interface Claim {
  sentence: string;
  startOffset: number;
  endOffset: number;
  sourceChunkId?: string;
  sourceDocumentId?: string;
  sourceFilename?: string;
}

export interface ClaimVerificationResult {
  claim: Claim;
  verdict: VerificationVerdict;
  confidence: number;
  reason: string;
  strategy: 'nli' | 'entity_grounding' | 'llm_judge';
  scores?: {
    entailment: number;
    contradiction: number;
    neutral: number;
  };
}

export interface VerificationResult {
  consistencyScore: number | null; // 0.0 - 1.0 or null if unavailable
  flaggedClaims: IFlaggedClaim[];
  claimResults: ClaimVerificationResult[];
  verificationWarning?: string;
}

export interface VerificationConfig {
  docType: string;
  nliThreshold: number; // Min entailment score required
  contradictionThreshold: number; // Max contradiction score allowed
  strictNumericGrounding: boolean;
  activeStrategies: ('nli' | 'entity_grounding' | 'llm_judge')[];
}

export interface ConsistencyChecker {
  name: string;
  verifyClaims(
    claims: Claim[],
    sourceChunks: SourceChunk[],
    config: VerificationConfig,
  ): Promise<ClaimVerificationResult[]>;
}
