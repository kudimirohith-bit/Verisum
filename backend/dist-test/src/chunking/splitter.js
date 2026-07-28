"use strict";
/**
 * Sentence Splitter
 *
 * A regex-based sentence boundary detector that:
 *  - Never splits on common medical/academic abbreviations (Dr., Mr., vs., etc.)
 *  - Handles ellipsis, decimal numbers, and initials
 *  - Detects structured section headers common in clinical documents
 *  - Works on both paragraph-structured and flowing plain text
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECTION_HEADER_RE = void 0;
exports.splitSentences = splitSentences;
exports.detectSectionHeader = detectSectionHeader;
// ── Known non-breaking abbreviations ──────────────────────────────────────────
const ABBREVS = new Set([
    'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'vs', 'dept', 'est',
    'fig', 'approx', 'incl', 'excl', 'max', 'min', 'avg', 'std',
    // medical
    'pt', 'hx', 'dx', 'tx', 'rx', 'cc', 'prn', 'qd', 'bid', 'tid', 'qid',
    'stat', 'po', 'iv', 'im', 'sc', 'sig', 'sos', 'npo', 'hs',
    'no', 'vol', 'pp', 'ed', 'al', 'eg', 'ie',
]);
/** Regex for section headers in clinical/biomedical documents */
exports.SECTION_HEADER_RE = /^(?:#{1,3}\s+|[A-Z][A-Z\s]{2,}:|(?:History|Assessment|Plan|Medications?|Allergies|Chief\s+Complaint|Physical\s+Examination|Review\s+of\s+Systems|Social\s+History|Family\s+History|Impression|Findings|Conclusions?|Background|Methods?|Results?|Discussion|References?|Abstract|Introduction|Discharge\s+(?:Instructions?|Summary)|Follow[- ]?up)\s*:)/im;
/**
 * Splits text into sentences, respecting abbreviations and section boundaries.
 *
 * Two-phase strategy:
 *  1. Split on double-newlines into paragraphs (handles structured docs)
 *  2. Within each paragraph, split on sentence-terminal punctuation
 *     (handles flowing plain text joined with spaces)
 */
function splitSentences(text) {
    if (!text || !text.trim())
        return [];
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const paragraphs = normalized.split(/\n\s*\n/);
    const result = [];
    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed)
            continue;
        if (exports.SECTION_HEADER_RE.test(trimmed)) {
            result.push(trimmed);
            continue;
        }
        const sents = sentenceSplit(trimmed);
        result.push(...sents);
    }
    return result.filter((s) => s.trim().length > 0);
}
/**
 * Core sentence splitter using a regex-based approach that scans
 * for terminal punctuation followed by whitespace + uppercase.
 * More reliable than a character-level loop for this use case.
 */
function sentenceSplit(text) {
    // Protect known abbreviations by replacing their dots with a placeholder
    let protected_ = text;
    for (const abbrev of ABBREVS) {
        // e.g., "Dr." → "Dr<DOT>"
        const re = new RegExp(`\\b(${escapeRegex(abbrev)})\\.`, 'gi');
        protected_ = protected_.replace(re, '$1<DOT>');
    }
    // Protect decimal numbers (3.14 → 3<DOT>14)
    protected_ = protected_.replace(/(\d)<DOT>(\d)/g, '$1<DOT>$2');
    protected_ = protected_.replace(/(\d)\.(\d)/g, '$1<DOT>$2');
    // Split on terminal punctuation followed by whitespace + uppercase or digit
    // Pattern: [.!?]+ optionally followed by closing quotes/parens,
    //          then whitespace, then an uppercase letter or digit
    const splitRe = /([.!?]+[)"']?)\s+(?=[A-Z\d("])/g;
    const parts = [];
    let lastIdx = 0;
    let match;
    while ((match = splitRe.exec(protected_)) !== null) {
        const end = match.index + match[1].length;
        const sentence = text.slice(lastIdx, end).trim();
        if (sentence)
            parts.push(sentence);
        // Move past the whitespace
        lastIdx = end + (match[0].length - match[1].length);
    }
    // Flush remainder
    const remainder = text.slice(lastIdx).trim();
    if (remainder)
        parts.push(remainder);
    // If splitting produced nothing (e.g., all-lowercase text), return as-is
    return parts.length > 0 ? parts : [text.trim()];
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Detects section headers in a block of text.
 * Returns the section name if the text starts with a header, else null.
 */
function detectSectionHeader(text) {
    const match = text.trim().match(exports.SECTION_HEADER_RE);
    return match ? match[0].trim() : null;
}
