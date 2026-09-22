/**
 * Text extraction utilities for supported file types:
 *   .txt  — direct read
 *   .pdf  — pdf-parse
 *   .docx — mammoth
 */


import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export type SupportedExtension = '.txt' | '.pdf' | '.docx';
export const SUPPORTED_EXTENSIONS: SupportedExtension[] = ['.txt', '.pdf', '.docx'];
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates file extension is in the allowed list.
 */
export function validateExtension(filename: string): SupportedExtension {
  const ext = path.extname(filename).toLowerCase() as SupportedExtension;
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Unsupported file type: "${ext}". Allowed: ${SUPPORTED_EXTENSIONS.join(', ')}`,
    );
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
export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const ext = validateExtension(filename);

  switch (ext) {
    case '.txt': {
      return buffer.toString('utf-8');
    }

    case '.pdf': {
      const data = await pdfParse(buffer);
      if (!data.text || data.text.trim().length === 0) {
        throw new Error('PDF appears to contain no extractable text (may be a scanned image).');
      }
      return data.text;
    }

    case '.docx': {
      const result = await mammoth.extractRawText({ buffer });
      if (!result.value || result.value.trim().length === 0) {
        throw new Error('DOCX file contains no extractable text.');
      }
      return result.value;
    }
  }
}
