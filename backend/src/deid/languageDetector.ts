/**
 * Language Detector Utility — BCP-47 Code Detection for Clinical Text.
 * Identifies document language at ingestion time to support multi-language routing
 * and fail-closed security policies.
 */

export interface LanguageDetectionResult {
  language: string; // BCP-47 language code, e.g. 'en', 'es', 'fr', 'de', 'zh'
  confidence: number; // 0.0 to 1.0
  isSupportedDeid: boolean;
}

// Languages with validated De-ID pipelines (currently English only)
const VALIDATED_DEID_LANGUAGES = new Set(['en', 'en-us', 'en-gb']);

/**
 * Detect language of input text using script analysis and n-gram/stopword heuristics.
 * Defaults to 'en' when ambiguous.
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  if (!text || !text.trim()) {
    return { language: 'en', confidence: 1.0, isSupportedDeid: true };
  }

  const sample = text.slice(0, 2000).toLowerCase();

  // 1. Script checks
  if (/[\u4e00-\u9fa5]/.test(sample)) {
    return { language: 'zh', confidence: 0.95, isSupportedDeid: false };
  }
  if (/[\u3040-\u30ff]/.test(sample)) {
    return { language: 'ja', confidence: 0.95, isSupportedDeid: false };
  }

  // 2. Stopword frequency matching for European languages
  const words = sample.split(/\W+/).filter((w) => w.length > 1);
  if (words.length === 0) {
    return { language: 'en', confidence: 0.8, isSupportedDeid: true };
  }

  const esStopwords = new Set(['el', 'la', 'los', 'las', 'del', 'con', 'para', 'paciente', 'diagnostico', 'hospital', 'que', 'una', 'sus']);
  const frStopwords = new Set(['le', 'la', 'les', 'des', 'avec', 'pour', 'patient', 'medical', 'dans', 'est', 'une', 'qui']);
  const deStopwords = new Set(['der', 'die', 'das', 'den', 'mit', 'fuer', 'patient', 'und', 'ist', 'einen', 'aus', 'nicht']);

  let esCount = 0;
  let frCount = 0;
  let deCount = 0;

  for (const w of words) {
    if (esStopwords.has(w)) esCount++;
    if (frStopwords.has(w)) frCount++;
    if (deStopwords.has(w)) deCount++;
  }

  const threshold = Math.max(2, Math.floor(words.length * 0.05));

  if (esCount >= threshold && esCount > frCount && esCount > deCount) {
    return { language: 'es', confidence: 0.85, isSupportedDeid: false };
  }
  if (frCount >= threshold && frCount > esCount && frCount > deCount) {
    return { language: 'fr', confidence: 0.85, isSupportedDeid: false };
  }
  if (deCount >= threshold && deCount > esCount && deCount > frCount) {
    return { language: 'de', confidence: 0.85, isSupportedDeid: false };
  }

  // Default to 'en'
  return {
    language: 'en',
    confidence: 0.9,
    isSupportedDeid: true,
  };
}

/**
 * Check if a language has a validated De-ID pipeline.
 */
export function isLanguageSupportedForDeid(language: string): boolean {
  if (!language) return true;
  return VALIDATED_DEID_LANGUAGES.has(language.toLowerCase().trim());
}
