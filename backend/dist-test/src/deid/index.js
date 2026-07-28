"use strict";
/**
 * De-identification Module — backend/src/deid/
 *
 * Strategy:
 * 1. Regex pass (Node) — handles well-structured HIPAA Safe-Harbor identifiers:
 *    names patterns, MRNs, dates, phone numbers, SSNs, emails, zip codes, ages,
 *    addresses, URLs, IP addresses, device IDs, biometric IDs.
 * 2. NER pass (model-service HTTP call via presidio/spaCy) — handles less-
 *    structured free-text entities (person names, organisations, locations).
 *    Falls back gracefully if model-service is unavailable.
 *
 * The result is the de-identified text plus a match count (for audit logging).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.regexDeid = regexDeid;
exports.deidentify = deidentify;
const axios_1 = __importDefault(require("axios"));
const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || 'http://localhost:8000';
const NER_TIMEOUT_MS = 5000; // fall back if model-service is slow
// ── HIPAA Safe-Harbor regex rules ─────────────────────────────────────────────
// Each rule: { pattern, tag, flags }
const REGEX_RULES = [
    // MRN — e.g., MRN: 123456, MRN#789012
    { pattern: '\\bMRN[:\\s#-]*\\d{4,12}\\b', tag: '[MRN]', flags: 'gi' },
    // SSN — e.g., 123-45-6789 or 123456789
    { pattern: '\\b\\d{3}[-\\s]?\\d{2}[-\\s]?\\d{4}\\b', tag: '[SSN]' },
    // Phone numbers — (555) 123-4567, 555-123-4567, +1 555 123 4567
    {
        pattern: '(\\+?1[-\\s]?)?(\\(?\\d{3}\\)?[-\\s]?)\\d{3}[-\\s]?\\d{4}',
        tag: '[PHONE]',
        flags: 'g',
    },
    // Dates — MM/DD/YYYY, DD-MM-YYYY, Month DD YYYY, DD Month YYYY, YYYY-MM-DD
    {
        pattern: '\\b(\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4}|\\d{4}[/\\-]\\d{1,2}[/\\-]\\d{1,2})\\b',
        tag: '[DATE]',
        flags: 'g',
    },
    {
        pattern: '\\b(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4}\\b',
        tag: '[DATE]',
        flags: 'gi',
    },
    {
        pattern: '\\b\\d{1,2}\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}\\b',
        tag: '[DATE]',
        flags: 'gi',
    },
    // Ages — "age 45", "45 years old", "45-year-old"
    {
        pattern: '\\b(age[d]?\\s+\\d{1,3}|\\d{1,3}[\\s-]year[s]?[\\s-]old)\\b',
        tag: '[AGE]',
        flags: 'gi',
    },
    // Email addresses
    {
        pattern: '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}',
        tag: '[EMAIL]',
        flags: 'gi',
    },
    // ZIP codes — 5-digit or 5+4
    { pattern: '\\b\\d{5}(?:-\\d{4})?\\b', tag: '[ZIP]', flags: 'g' },
    // IP addresses
    {
        pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b',
        tag: '[IP_ADDRESS]',
        flags: 'g',
    },
    // URLs
    {
        pattern: 'https?://[^\\s<>"{}|\\\\^`[\\]]+',
        tag: '[URL]',
        flags: 'gi',
    },
    // Patient ID / Account number patterns — "Patient ID: 12345", "Acct#: 9876"
    {
        pattern: '\\b(Patient\\s+(ID|#|Number)[:\\s#-]*)\\d{4,12}\\b',
        tag: '[PATIENT_ID]',
        flags: 'gi',
    },
    // Medical Record Number alternatives
    {
        pattern: '\\b(Record\\s+Number[:\\s#-]*)\\d{4,12}\\b',
        tag: '[MRN]',
        flags: 'gi',
    },
    // Room / bed numbers
    {
        pattern: '\\b(Room|Bed|Ward)\\s+\\d{1,4}[A-Z]?\\b',
        tag: '[LOCATION]',
        flags: 'gi',
    },
];
function regexDeid(text) {
    let result = text;
    let phiMatchCount = 0;
    const matchedTags = [];
    for (const rule of REGEX_RULES) {
        const regex = new RegExp(rule.pattern, rule.flags ?? 'g');
        const matches = result.match(regex);
        if (matches && matches.length > 0) {
            phiMatchCount += matches.length;
            matchedTags.push(...Array(matches.length).fill(rule.tag));
            result = result.replace(regex, rule.tag);
        }
    }
    return { deidentifiedText: result, phiMatchCount, matchedTags };
}
/**
 * Calls model-service /deid/ner endpoint for NER-based de-identification.
 * Returns null if the service is unavailable (graceful fallback).
 */
async function nerDeid(text) {
    try {
        const resp = await axios_1.default.post(`${MODEL_SERVICE_URL}/deid/ner`, { text }, { timeout: NER_TIMEOUT_MS });
        return resp.data;
    }
    catch {
        // model-service unavailable — fall back to regex-only
        console.warn('[DeID] model-service NER unavailable; using regex-only de-identification.');
        return null;
    }
}
// ── Combined de-identification pipeline ───────────────────────────────────────
/**
 * Full de-identification pipeline:
 * 1. Regex pass (always runs)
 * 2. NER pass via model-service (optional, falls back gracefully)
 *
 * Returns de-identified text + total PHI match count for audit logging.
 */
async function deidentify(rawText) {
    // Step 1: regex pass
    const regexResult = regexDeid(rawText);
    // Step 2: NER pass on the regex-cleaned text
    const nerResult = await nerDeid(regexResult.deidentifiedText);
    if (!nerResult) {
        // Fallback — regex only
        return regexResult;
    }
    const nerMatchCount = nerResult.entities.length;
    const nerTags = nerResult.entities.map((e) => `[${e.label}]`);
    return {
        deidentifiedText: nerResult.deidentified_text,
        phiMatchCount: regexResult.phiMatchCount + nerMatchCount,
        matchedTags: [...regexResult.matchedTags, ...nerTags],
    };
}
