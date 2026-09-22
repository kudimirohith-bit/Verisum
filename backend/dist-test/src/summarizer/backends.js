"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendRegistry = exports.HostedLLMBackend = exports.LocalModelServiceBackend = exports.MockBackend = void 0;
const axios_1 = __importDefault(require("axios"));
const secrets_js_1 = require("../config/secrets.js");
// ── Mock Backend ───────────────────────────────────────────────────────────────
class MockBackend {
    name = 'mock';
    maxContextTokens = 1000;
    supportedLanguages = ['en', 'es', 'fr', 'de'];
    countTokens(text) {
        if (!text || !text.trim())
            return 0;
        return text.trim().split(/\s+/).length;
    }
    async summarize(text, docType) {
        const start = Date.now();
        const words = text.trim().split(/\s+/);
        const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
        let summaryText;
        if (docType === 'biomedical_literature') {
            summaryText = `Biomedical Literature Synthesis (n=${words.length}): ${sentences.slice(0, 3).join('. ')}. Study design, sample size, primary outcomes, and effect sizes were evaluated.`;
        }
        else {
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
exports.MockBackend = MockBackend;
// ── Local Model Service Backend ────────────────────────────────────────────────
class LocalModelServiceBackend {
    name = 'local_clinical_model';
    maxContextTokens = 512; // Typical for ClinicalT5 / BioBART
    supportedLanguages = ['en'];
    serviceUrl;
    constructor() {
        this.serviceUrl = (0, secrets_js_1.getSecret)('MODEL_SERVICE_URL', 'http://localhost:8000');
    }
    countTokens(text) {
        if (!text || !text.trim())
            return 0;
        return text.trim().split(/\s+/).length;
    }
    async summarize(text, docType) {
        const start = Date.now();
        try {
            const response = await axios_1.default.post(`${this.serviceUrl}/summarize`, { text, doc_type: docType }, { timeout: 15000 });
            const { summary_text, model_name, model_version } = response.data;
            return {
                summaryText: summary_text,
                modelName: model_name || 'local-hf-model',
                modelVersion: model_version || '1.0.0',
                latencyMs: Date.now() - start,
                rawProviderResponse: response.data,
            };
        }
        catch (error) {
            const axiosError = error;
            const msg = axiosError.response?.data?.message || axiosError.message || 'Unknown error';
            console.warn(`[LocalModelService] HTTP call failed: ${msg}. Using local fallback.`);
            const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
            const summaryText = sentences.length > 2
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
exports.LocalModelServiceBackend = LocalModelServiceBackend;
// ── Hosted LLM Backend ─────────────────────────────────────────────────────────
class HostedLLMBackend {
    name = 'hosted_llm';
    maxContextTokens = 4096;
    supportedLanguages = ['en', 'es', 'fr', 'de', 'zh'];
    provider;
    apiKey;
    modelName;
    constructor() {
        this.provider = (0, secrets_js_1.getSecret)('LLM_PROVIDER', 'gemini');
        this.apiKey = (0, secrets_js_1.getSecret)('GEMINI_API_KEY', (0, secrets_js_1.getSecret)('LLM_API_KEY', ''));
        this.modelName =
            (0, secrets_js_1.getSecret)('GEMINI_MODEL') ||
                (0, secrets_js_1.getSecret)('LLM_MODEL_NAME') ||
                (this.provider === 'openai'
                    ? 'gpt-3.5-turbo'
                    : this.provider === 'anthropic'
                        ? 'claude-3-haiku-20240307'
                        : 'gemini-1.5-flash');
    }
    countTokens(text) {
        if (!text)
            return 0;
        const wordCount = text.trim().split(/\s+/).length;
        return Math.ceil(wordCount * 1.33);
    }
    async summarize(text, docType) {
        const start = Date.now();
        if (!this.apiKey) {
            console.warn('[HostedLLMBackend] API key not configured. Using fallback summary.');
            return this.fallbackSummary(text, docType, start, 'API key missing');
        }
        let attempts = 0;
        const maxAttempts = 3;
        let lastError = null;
        while (attempts < maxAttempts) {
            attempts++;
            try {
                if (this.provider === 'gemini') {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
                    const response = await axios_1.default.post(url, {
                        contents: [
                            {
                                role: 'user',
                                parts: [
                                    {
                                        text: `You are an expert clinical summarizer. Summarize the following ${docType}:\n\n${text}`,
                                    },
                                ],
                            },
                        ],
                        generationConfig: {
                            temperature: 0.2,
                        },
                    }, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 20000,
                    });
                    const summaryText = response.data.candidates?.[0]?.content?.parts?.[0]?.text ||
                        'No response content generated by Gemini API.';
                    return {
                        summaryText,
                        modelName: this.modelName,
                        modelVersion: 'gemini-v1',
                        latencyMs: Date.now() - start,
                        rawProviderResponse: response.data,
                    };
                }
                else if (this.provider === 'openai') {
                    const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                        model: this.modelName,
                        messages: [
                            {
                                role: 'system',
                                content: `You are an expert clinical summarizer. Summarize the following ${docType}.`,
                            },
                            { role: 'user', content: text },
                        ],
                        temperature: 0.2,
                    }, {
                        headers: {
                            Authorization: `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        timeout: 20000,
                    });
                    return {
                        summaryText: response.data.choices[0].message.content,
                        modelName: this.modelName,
                        modelVersion: 'openai-v1',
                        latencyMs: Date.now() - start,
                        rawProviderResponse: response.data,
                    };
                }
                else {
                    const response = await axios_1.default.post('https://api.anthropic.com/v1/messages', {
                        model: this.modelName,
                        max_tokens: 1024,
                        system: `You are an expert clinical summarizer. Summarize the following ${docType}.`,
                        messages: [{ role: 'user', content: text }],
                    }, {
                        headers: {
                            'x-api-key': this.apiKey,
                            'anthropic-version': '2023-06-01',
                            'content-type': 'application/json',
                        },
                        timeout: 20000,
                    });
                    return {
                        summaryText: response.data.content[0].text,
                        modelName: this.modelName,
                        modelVersion: 'anthropic-v1',
                        latencyMs: Date.now() - start,
                        rawProviderResponse: response.data,
                    };
                }
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const axiosError = error;
                const status = axiosError.response?.status;
                console.warn(`[HostedLLM] Attempt ${attempts} failed (status: ${status}, msg: ${lastError.message})`);
                if (attempts < maxAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, attempts * 500));
                }
            }
        }
        return this.fallbackSummary(text, docType, start, lastError?.message || 'Retries exhausted');
    }
    fallbackSummary(text, docType, startTime, reason) {
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
exports.HostedLLMBackend = HostedLLMBackend;
// ── Backend Registry ──────────────────────────────────────────────────────────
class BackendRegistry {
    static instances = {
        mock: new MockBackend(),
        local: new LocalModelServiceBackend(),
        local_clinical_model: new LocalModelServiceBackend(),
        hosted_llm: new HostedLLMBackend(),
    };
    /**
     * Returns a SummarizerBackend by its string identifier.
     */
    static get(backendId) {
        const backend = this.instances[backendId];
        if (!backend) {
            console.warn(`[BackendRegistry] Unknown backend: "${backendId}". Defaulting to "mock".`);
            return this.instances.mock;
        }
        return backend;
    }
    /**
     * Returns a backend after checking that it supports the document's language.
     * Throws an Error if the backend does not support the specified language.
     */
    static getForLanguage(backendId, language = 'en') {
        const backend = this.get(backendId);
        const lang = (language || 'en').toLowerCase().trim();
        if (!backend.supportedLanguages.includes(lang) && !backend.supportedLanguages.includes('*')) {
            throw new Error(`Backend '${backendId}' does not support document language '${language}'. Supported languages for '${backendId}': ${backend.supportedLanguages.join(', ')}.`);
        }
        return backend;
    }
}
exports.BackendRegistry = BackendRegistry;
