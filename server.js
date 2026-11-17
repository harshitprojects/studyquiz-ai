/**
 * AI Study Assistant - Backend Server
 * Express server handling PDF upload, text extraction, chat Q&A, and quiz generation.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const { extractTextFromPDF } = require('./services/pdfService');
const { getActiveProvider, answerQuestion, generateQuiz } = require('./services/aiService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for in-memory file uploads (max 25MB)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      path.extname(file.originalname).toLowerCase() === '.pdf';
    if (!isPdf) {
      return cb(new Error('Only PDF files are allowed. Please upload a valid .pdf file.'));
    }
    cb(null, true);
  },
});

// In-memory document store
// Maps documentId -> { id, fileName, fileSize, pageCount, wordCount, text, uploadedAt }
const documents = new Map();

// Helper to format bytes to human readable string
function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ==========================================
// API Routes
// ==========================================

/**
 * GET /api/status
 * Health check & status of AI API key configuration
 */
app.get('/api/status', (req, res) => {
  const provider = getActiveProvider();
  res.json({
    status: 'ok',
    configured: Boolean(provider),
    activeProvider: provider,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()),
  });
});

/**
 * POST /api/upload
 * Handles PDF upload, extracts text and metadata, and stores in session cache
 */
app.post('/api/upload', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded. Please choose a file.' });
    }

    const { originalname, size, buffer } = req.file;

    // Extract text & metadata from PDF
    const { text, pageCount, wordCount } = await extractTextFromPDF(buffer);

    // Create unique ID for document session
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const documentData = {
      id: documentId,
      fileName: originalname,
      fileSize: formatBytes(size),
      rawBytes: size,
      pageCount,
      wordCount,
      text,
      uploadedAt: new Date().toISOString(),
    };

    documents.set(documentId, documentData);

    // Generate a quick initial preview snippet
    const preview = text.slice(0, 300) + (text.length > 300 ? '...' : '');

    res.status(200).json({
      success: true,
      message: 'PDF uploaded and parsed successfully.',
      document: {
        id: documentId,
        fileName: documentData.fileName,
        fileSize: documentData.fileSize,
        pageCount: documentData.pageCount,
        wordCount: documentData.wordCount,
        preview,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/chat
 * Answers questions about the uploaded PDF strictly using document content
 */
app.post('/api/chat', async (req, res, next) => {
  try {
    const { documentId, question, history } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'Missing documentId. Please upload a PDF first.' });
    }

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Please provide a valid question.' });
    }

    const doc = documents.get(documentId);
    if (!doc) {
      return res.status(404).json({
        error: 'Document session expired or not found. Please re-upload your PDF.',
      });
    }

    const answer = await answerQuestion({
      documentText: doc.text,
      question: question.trim(),
      history: history || [],
    });

    res.json({
      success: true,
      answer,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/quiz
 * Generates 10 multiple-choice questions from the uploaded PDF
 */
app.post('/api/quiz', async (req, res, next) => {
  try {
    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'Missing documentId. Please upload a PDF first.' });
    }

    const doc = documents.get(documentId);
    if (!doc) {
      return res.status(404).json({
        error: 'Document session expired or not found. Please re-upload your PDF.',
      });
    }

    const questions = await generateQuiz({
      documentText: doc.text,
    });

    res.json({
      success: true,
      count: questions.length,
      questions,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/document/:id
 * Clears an uploaded document from server memory
 */
app.delete('/api/document/:id', (req, res) => {
  const { id } = req.params;
  const existed = documents.delete(id);
  res.json({ success: existed, message: existed ? 'Document removed' : 'Document not found' });
});

// Fallback to index.html for single-page app behavior
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('API Error:', err.message);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File size exceeds the 25MB limit. Please upload a smaller PDF.',
      });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  res.status(500).json({
    error: err.message || 'An unexpected error occurred while processing your request.',
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 AI Study Assistant server running locally:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`===============================================`);
  const provider = getActiveProvider();
  if (provider) {
    console.log(`🤖 AI Provider: ${provider.toUpperCase()}`);
  } else {
    console.warn(`⚠️  No API key configured in .env yet.`);
    console.warn(`   Add GEMINI_API_KEY=your_key to enable AI features.`);
  }
});
