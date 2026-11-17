/**
 * AI Service
 * Handles AI model interactions for document question-answering and quiz generation.
 * Supports Google Gemini API (primary) and OpenAI (alternative fallback).
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Checks which AI provider is configured in environment variables.
 */
function getActiveProvider() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '') {
    return 'gemini';
  }
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '') {
    return 'openai';
  }
  return null;
}

/**
 * Calls Gemini model with automatic fallback if a model returns 404 (version mismatch or deprecation).
 */
async function callGemini(prompt, generationConfig = {}) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const preferredModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const fallbackModels = [preferredModel, 'gemini-3.8-flash', 'gemini-flash-latest'];

  let lastError = null;
  for (const modelName of fallbackModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig,
      });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (err) {
      lastError = err;
      // If model returned 404 (model not found / deprecated for current API key), fallback
      if (err.status === 404 || (err.message && err.message.includes('404'))) {
        console.warn(`[Gemini API] Model "${modelName}" returned 404 Not Found. Trying fallback model...`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Answers a question based strictly on the provided document text.
 * @param {Object} params
 * @param {string} params.documentText - The full extracted text of the PDF
 * @param {string} params.question - The user's question
 * @param {Array<{role: string, content: string}>} [params.history] - Prior chat turns
 * @returns {Promise<string>} Markdown-formatted answer
 */
async function answerQuestion({ documentText, question, history = [] }) {
  const provider = getActiveProvider();

  if (!provider) {
    throw new Error(
      'No AI API key found. Please set GEMINI_API_KEY in your .env file and restart the server.'
    );
  }

  // Cap document text to safe context limit if extremely large (e.g. 100,000 words ~ 400k chars)
  const maxChars = 250000;
  const contextText =
    documentText.length > maxChars
      ? documentText.slice(0, maxChars) + '\n\n[Document truncated for length...]'
      : documentText;

  const systemInstruction = `You are an expert AI Study Assistant.
Your task is to help a student learn and answer questions based EXCLUSIVELY on the provided document content.

GROUNDING RULES:
1. Ground your answers strictly in the text of the uploaded PDF below.
2. If the user's question asks for information NOT found or supported in the document, explicitly reply:
   "I could not find this information in the uploaded document. The document does not appear to cover this topic."
   Do NOT hallucinate, guess, or bring in outside information.
3. Be clear, educational, and well-structured. Use Markdown formatting (bold terms, bullet points, headers, numbered lists) to make explanations easy to study.
4. When possible, cite the relevant section, title, or context from the document.`;

  const prompt = `${systemInstruction}

DOCUMENT CONTENT:
---
${contextText}
---

STUDENT'S QUESTION:
${question}

STUDY ASSISTANT ANSWER (strictly based on the document):`;

  if (provider === 'gemini') {
    return await callGemini(prompt);
  }

  if (provider === 'openai') {
    const messages = [
      { role: 'system', content: systemInstruction },
      {
        role: 'user',
        content: `DOCUMENT CONTENT:\n---\n${contextText}\n---\n\nQUESTION: ${question}`,
      },
    ];

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${errData.error?.message || res.statusText}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }
}

/**
 * Generates 10 multiple-choice questions from the document content.
 * @param {Object} params
 * @param {string} params.documentText - The full extracted text of the PDF
 * @returns {Promise<Array<Object>>} Array of 10 question objects
 */
async function generateQuiz({ documentText }) {
  const provider = getActiveProvider();

  if (!provider) {
    throw new Error(
      'No AI API key found. Please set GEMINI_API_KEY in your .env file and restart the server.'
    );
  }

  const maxChars = 200000;
  const contextText =
    documentText.length > maxChars
      ? documentText.slice(0, maxChars) + '\n\n[Document truncated for length...]'
      : documentText;

  const prompt = `You are an expert educator and exam creator.
Analyze the following document and generate a 10-question multiple-choice quiz to test a student's comprehension of the key concepts, definitions, and facts.

DOCUMENT CONTENT:
---
${contextText}
---

REQUIREMENTS:
1. Generate exactly 10 questions.
2. Every question must be directly grounded in and answerable from the document text above.
3. Each question must have exactly 4 choices (options: A, B, C, D).
4. Only one option should be the correct answer.
5. Provide a 0-indexed integer (0, 1, 2, or 3) indicating which option is correct.
6. Provide a concise explanation explaining why the answer is correct based on the document.
7. Return ONLY valid JSON matching the format below, with NO markdown backticks or commentary.

JSON FORMAT:
[
  {
    "id": 1,
    "question": "What is ...?",
    "options": [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    "answer": 0,
    "explanation": "According to the document, ..."
  }
]`;

  let rawOutput = '';

  if (provider === 'gemini') {
    rawOutput = await callGemini(prompt, {
      responseMimeType: 'application/json',
    });
  } else if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${errData.error?.message || res.statusText}`);
    }

    const data = await res.json();
    rawOutput = data.choices[0].message.content;
  }

  // Parse and sanitize the JSON response
  return parseQuizJSON(rawOutput);
}

/**
 * Sanitizes and parses raw JSON response into structured question array.
 */
function parseQuizJSON(rawOutput) {
  let cleaned = rawOutput.trim();

  // Strip code blocks if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```$/, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // If wrapped in an object like { "questions": [...] } or { "quiz": [...] }
    const match = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (innerErr) {
        throw new Error('Failed to parse generated quiz questions as JSON.');
      }
    } else {
      throw new Error('Invalid JSON format received from AI model.');
    }
  }

  // If parsed is { questions: [...] } or { quiz: [...] }
  if (!Array.isArray(parsed)) {
    if (Array.isArray(parsed.questions)) {
      parsed = parsed.questions;
    } else if (Array.isArray(parsed.quiz)) {
      parsed = parsed.quiz;
    } else {
      throw new Error('Parsed response does not contain an array of questions.');
    }
  }

  // Validate and normalize questions
  return parsed.map((q, idx) => ({
    id: q.id || idx + 1,
    question: q.question || `Question ${idx + 1}`,
    options: Array.isArray(q.options) && q.options.length >= 2 ? q.options : ['A', 'B', 'C', 'D'],
    answer: typeof q.answer === 'number' && q.answer >= 0 && q.answer < (q.options?.length || 4) ? q.answer : 0,
    explanation: q.explanation || 'Refer to the uploaded document for context.',
  }));
}

module.exports = {
  getActiveProvider,
  answerQuestion,
  generateQuiz,
};
