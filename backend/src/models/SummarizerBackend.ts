export interface SummaryResult {
  summaryText: string;
  modelName: string;
  modelVersion: string;
  latencyMs: number;
  rawProviderResponse: unknown;
}

export interface SummarizerBackend {
  name: string;
  maxContextTokens: number;
  summarize(text: string, docType: string): Promise<SummaryResult>;
  countTokens(text: string): number;
}
