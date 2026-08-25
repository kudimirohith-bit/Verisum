import axios from 'axios';
import { SummarizerBackend, SummaryResult } from '../models/SummarizerBackend.js';

// ── Mock Backend ───────────────────────────────────────────────────────────────
export class MockBackend implements SummarizerBackend {
  readonly name = 'mock';
  readonly maxContextTokens = 1000;

  countTokens(text: string): number {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  }

  async summarize(text: string, docType: string): Promise<SummaryResult> {
    const start = Date.now();
    const words = text.trim().split(/\s+/);
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);

    let summaryText: string;
    if (docType === 'biomedical_literature') {
      summaryText = `Biomedical Literature Synthesis (n=${words.length}): ${sentences.slice(0, 3).join('. ')}. Study design, sample size, primary outcomes, and effect sizes were evaluated.`;
    } else {
      summaryText =
        words.length <= 25
          ? `Mock summary (${docType}): ${text}`
          : `Mock summary (${docType}): ${words.slice(0, 25).join(' ')} [...]`;
    }

    return {
      summaryText,
      modelName: 'MockSummarizer',
      modelVersion: '1.0.0-mock',
      latencyMs: Date.now() - start,
      rawProviderResponse: { mock: true, inputWords: words.length },
    };
  }
}

// ── Local Model Service Backend ────────────────────────────────────────────────
export class LocalModelServiceBackend implements SummarizerBackend {
  readonly name = 'local_clinical_model';
  readonly maxContextTokens = 512; // Typical for ClinicalT5 / BioBART
  private readonly serviceUrl: string;

  constructor() {
    this.serviceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8000';
  }

  countTokens(text: string): number {
    // Estimator using whitespace-split
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  }

  async summarize(text: string, docType: string): Promise<SummaryResult> {
    const start = Date.now();
    try {
      const response = await axios.post(
        `${this.serviceUrl}/summarize`,
        { text, doc_type: docType },
        { timeout: 15000 }, // 15s timeout
      );

      const { summary_text, model_name, model_version } = response.data;

      return {
        summaryText: summary_text,
        modelName: model_name || 'local-hf-model',
        modelVersion: model_version || '1.0.0',
        latencyMs: Date.now() - start,
        rawProviderResponse: response.data,
      };
    } catch (error: any) {
      // In non-production or test env, or as robust fallback when service is offline
      const msg = error.response?.data?.message || error.message;
      console.warn(`[LocalModelService] HTTP call failed: ${msg}. Using local fallback.`);

      // Robust fallback sentence extraction
      const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
      const summaryText =
        sentences.length > 2
          ? `Fallback Summary: ${sentences.slice(0, 2).join('. ')}.`
          : `Fallback Summary: ${text}`;

      return {
        summaryText,
        modelName: 'local-clinical-model-fallback',
        modelVersion: '0.0.0-fallback',
        latencyMs: Date.now() - start,
        rawProviderResponse: { error: msg },
      };
    }
  }
}

// ── Hosted LLM Backend ─────────────────────────────────────────────────────────
export class HostedLLMBackend implements SummarizerBackend {
  readonly name = 'hosted_llm';
  readonly maxContextTokens = 4096;
  private readonly provider: string;
  private readonly apiKey: string;
  private readonly modelName: string;

  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'anthropic';
    this.apiKey = process.env.LLM_API_KEY || '';
    this.modelName =
      process.env.LLM_MODEL_NAME ||
      (this.provider === 'openai' ? 'gpt-3.5-turbo' : 'claude-3-haiku-20240307');
  }

  countTokens(text: string): number {
    // Standard LLM token approximation: ~4 chars or 0.75 words per token
    if (!text) return 0;
    const wordCount = text.trim().split(/\s+/).length;
    return Math.ceil(wordCount * 1.33);
  }

  async summarize(text: string, docType: string): Promise<SummaryResult> {
    const start = Date.now();

    if (!this.apiKey) {
      console.warn('[HostedLLMBackend] API key not configured. Using fallback summary.');
      return this.fallbackSummary(text, docType, start, 'API key missing');
    }

    let attempts = 0;
    const maxAttempts = 3;
    let lastError: any = null;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        if (this.provider === 'openai') {
          const response = await axios.post(
            'https://api.openai.com/v1/chat/completypes',
            {
              model: this.modelName,
              messages: [
                {
                  role: 'system',
                  content: `You are an expert clinical summarizer. Summarize the following ${docType}.`,
                },
                { role: 'user', content: text },
              ],
              temperature: 0.2,
            },
            {
              headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 20000,
            },
          );

          return {
            summaryText: response.data.choices[0].message.content,
            modelName: this.modelName,
            modelVersion: 'openai-v1',
            latencyMs: Date.now() - start,
            rawProviderResponse: response.data,
          };
        } else {
          // Anthropic default
          const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
              model: this.modelName,
              max_tokens: 1024,
              system: `You are an expert clinical summarizer. Summarize the following ${docType}.`,
              messages: [{ role: 'user', content: text }],
            },
            {
              headers: {
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
              },
              timeout: 20000,
            },
          );

          return {
            summaryText: response.data.content[0].text,
            modelName: this.modelName,
            modelVersion: 'anthropic-v1',
            latencyMs: Date.now() - start,
            rawProviderResponse: response.data,
          };
        }
      } catch (error: any) {
        lastError = error;
        const status = error.response?.status;
        console.warn(
          `[HostedLLM] Attempt ${attempts} failed (status: ${status}, msg: ${error.message})`,
        );

        // Exponential backoff before retry (e.g. 500ms, 1000ms)
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempts * 500));
        }
      }
    }

    return this.fallbackSummary(text, docType, start, lastError?.message || 'Retries exhausted');
  }

  private fallbackSummary(
    text: string,
    docType: string,
    startTime: number,
    reason: string,
  ): SummaryResult {
    const words = text.trim().split(/\s+/);
    const summaryText = `[Hosted LLM Fallback - ${reason}] Summary of ${docType}: ${words.slice(0, 20).join(' ')} [...]`;
    return {
      summaryText,
      modelName: `${this.modelName}-fallback`,
      modelVersion: 'fallback-1.0',
      latencyMs: Date.now() - startTime,
      rawProviderResponse: { fallback: true, reason },
    };
  }
}

// ── Backend Registry ──────────────────────────────────────────────────────────
export class BackendRegistry {
  private static readonly instances: Record<string, SummarizerBackend> = {
    mock: new MockBackend(),
    local: new LocalModelServiceBackend(),
    local_clinical_model: new LocalModelServiceBackend(),
    hosted_llm: new HostedLLMBackend(),
  };

  /**
   * Returns a SummarizerBackend by its string identifier.
   * Standard keys: "mock", "local_clinical_model", "hosted_llm".
   */
  static get(backendId: string): SummarizerBackend {
    const backend = this.instances[backendId];
    if (!backend) {
      console.warn(`[BackendRegistry] Unknown backend: "${backendId}". Defaulting to "mock".`);
      return this.instances.mock;
    }
    return backend;
  }
}
