"use strict";
/**
 * Text extraction utilities for supported file types:
 *   .txt  — direct read
 *   .pdf  — pdf-parse
 *   .docx — mammoth
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_FILE_SIZE_BYTES = exports.SUPPORTED_EXTENSIONS = void 0;
exports.validateExtension = validateExtension;
exports.extractText = extractText;
const path_1 = __importDefault(require("path"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const mammoth_1 = __importDefault(require("mammoth"));
exports.SUPPORTED_EXTENSIONS = ['.txt', '.pdf', '.docx'];
exports.MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
/**
 * Validates file extension is in the allowed list.
 */
function validateExtension(filename) {
    const ext = path_1.default.extname(filename).toLowerCase();
    if (!exports.SUPPORTED_EXTENSIONS.includes(ext)) {
        throw new Error(`Unsupported file type: "${ext}". Allowed: ${exports.SUPPORTED_EXTENSIONS.join(', ')}`);
    }
    return ext;
}
/**
 * Extracts plain text from an uploaded file buffer.
 *
 * @param buffer   Raw file bytes
 * @param filename Original filename (used to detect extension)
 * @returns        Extracted plain text
 */
async function extractText(buffer, filename) {
    const ext = validateExtension(filename);
    switch (ext) {
        case '.txt': {
            return buffer.toString('utf-8');
        }
        case '.pdf': {
            const data = await (0, pdf_parse_1.default)(buffer);
            if (!data.text || data.text.trim().length === 0) {
                throw new Error('PDF appears to contain no extractable text (may be a scanned image).');
            }
            return data.text;
        }
        case '.docx': {
            const result = await mammoth_1.default.extractRawText({ buffer });
            if (!result.value || result.value.trim().length === 0) {
                throw new Error('DOCX file contains no extractable text.');
            }
            return result.value;
        }
    }
}
