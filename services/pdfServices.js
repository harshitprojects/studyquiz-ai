/**
 * PDF Service
 * Handles extracting text and metadata from uploaded PDF documents.
 * Supports both modern pdf-parse (v2 class-based) and legacy (v1 function-based).
 */

const pdfParseModule = require('pdf-parse');

/**
 * Extracts plain text and metadata from a PDF buffer.
 * @param {Buffer} dataBuffer - Raw binary buffer of the uploaded PDF
 * @returns {Promise<{ text: string, pageCount: number, wordCount: number }>}
 */
async function extractTextFromPDF(dataBuffer) {
  if (!dataBuffer || !Buffer.isBuffer(dataBuffer)) {
    throw new Error('Invalid input: expected a valid file buffer.');
  }

  let rawText = '';
  let pageCount = 1;

  try {
    // Check if pdf-parse is v2 (exports PDFParse class)
    if (pdfParseModule.PDFParse) {
      const parser = new pdfParseModule.PDFParse({ data: dataBuffer });
      try {
        const textResult = await parser.getText();
        const info = await parser.getInfo();

        if (typeof textResult === 'string') {
          rawText = textResult;
        } else if (textResult && typeof textResult.text === 'string') {
          rawText = textResult.text;
        } else if (textResult && Array.isArray(textResult.pages)) {
          rawText = textResult.pages.map(p => p.text || '').join('\n\n');
        }

        if (info && typeof info.total === 'number') {
          pageCount = info.total;
        } else if (textResult && typeof textResult.total === 'number') {
          pageCount = textResult.total;
        }
      } finally {
        if (typeof parser.destroy === 'function') {
          await parser.destroy();
        }
      }
    } else if (typeof pdfParseModule === 'function') {
      // Legacy pdf-parse v1 function format
      const data = await pdfParseModule(dataBuffer);
      rawText = data.text || '';
      pageCount = data.numpages || 1;
    } else {
      throw new Error('Unable to initialize PDF parser: unsupported library export.');
    }
  } catch (err) {
    console.error('Error during PDF parsing:', err);
    throw new Error(`Failed to extract text from PDF: ${err.message}`);
  }

  // Clean and normalize text
  const cleanedText = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleanedText || cleanedText.length === 0) {
    throw new Error(
      'The uploaded PDF contains no readable text. It might be a scanned image or empty. Please use a text-based PDF.'
    );
  }

  // Calculate word count
  const wordCount = cleanedText.split(/\s+/).filter(Boolean).length;

  return {
    text: cleanedText,
    pageCount,
    wordCount,
  };
}

module.exports = {
  extractTextFromPDF,
};
