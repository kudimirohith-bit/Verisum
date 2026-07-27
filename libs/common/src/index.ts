export interface SummarizationJobPayload {
  jobId: string;
  documentText: string;
  options?: {
    maxLength?: number;
    focusAreas?: string[];
  };
  createdAt: string;
}

export interface SummarizationJobResult {
  jobId: string;
  summary: string;
  confidenceScore: number;
  completedAt: string;
}

export const QUEUE_NAMES = {
  SUMMARIZATION: 'summarization-queue',
} as const;

export const SERVICE_STATUS = {
  OK: 'ok',
  ERROR: 'error',
} as const;
