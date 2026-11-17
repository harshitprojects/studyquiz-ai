/**
 * AI Study Assistant - Frontend Application Logic
 * Pure vanilla JavaScript (ES6+) for file upload, grounded Q&A chat, and interactive quiz.
 */

// Application State
const state = {
  currentDocument: null, // { id, fileName, fileSize, pageCount, wordCount }
  chatHistory: [],       // [{ role: 'user' | 'model', content: string }]
  currentQuiz: [],       // Array of 10 questions
  quizAnswers: {},       // { [questionIndex]: selectedOptionIndex }
  quizScore: 0,
  activeTab: 'chatView',
  apiConfigured: false,
};

// DOM Elements
const elements = {
  // Status & Navigation
  apiStatusBadge: document.getElementById('apiStatusBadge'),
  apiStatusText: document.getElementById('apiStatusText'),
  tabChat: document.getElementById('tabChat'),
  tabQuiz: document.getElementById('tabQuiz'),
  chatView: document.getElementById('chatView'),
  quizView: document.getElementById('quizView'),

  // Upload & Document
  uploadSection: document.getElementById('uploadSection'),
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('pdfFileInput'),
  uploadLoader: document.getElementById('uploadLoader'),
  uploadLoaderText: document.getElementById('uploadLoaderText'),
  documentCard: document.getElementById('documentCard'),
  docName: document.getElementById('docName'),
  docPages: document.getElementById('docPages'),
  docWords: document.getElementById('docWords'),
  docSize: document.getElementById('docSize'),
  btnChangePdf: document.getElementById('btnChangePdf'),
  btnGenerateQuiz: document.getElementById('btnGenerateQuiz'),
  promptChips: document.querySelectorAll('.chip'),

  // Chat Interface
  chatDocStatus: document.getElementById('chatDocStatus'),
  chatMessages: document.getElementById('chatMessages'),
  chatForm: document.getElementById('chatForm'),
  chatInput: document.getElementById('chatInput'),
  btnSendChat: document.getElementById('btnSendChat'),
  btnClearChat: document.getElementById('btnClearChat'),

  // Quiz Interface
  quizEmptyState: document.getElementById('quizEmptyState'),
  quizLoadingState: document.getElementById('quizLoadingState'),
  quizContainer: document.getElementById('quizContainer'),
  btnEmptyGenerateQuiz: document.getElementById('btnEmptyGenerateQuiz'),
  quizDocLabel: document.getElementById('quizDocLabel'),
  quizScorePill: document.getElementById('quizScorePill'),
  btnResetQuiz: document.getElementById('btnResetQuiz'),
  btnRegenerateQuiz: document.getElementById('btnRegenerateQuiz'),
  questionsList: document.getElementById('questionsList'),
  quizSummaryCard: document.getElementById('quizSummaryCard'),
  summaryTitle: document.getElementById('summaryTitle'),
  summaryScoreText: document.getElementById('summaryScoreText'),
  summaryEmoji: document.getElementById('summaryEmoji'),
  btnSummaryRetake: document.getElementById('btnSummaryRetake'),
  btnSummaryNew: document.getElementById('btnSummaryNew'),
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  checkBackendStatus();
  setupEventListeners();
});

// ==========================================
// 1. Backend Status & API Check
// ==========================================
async function checkBackendStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    if (data.configured) {
      state.apiConfigured = true;
      elements.apiStatusBadge.className = 'status-badge ready';
      elements.apiStatusText.textContent = `AI Ready (${data.activeProvider.toUpperCase()})`;
    } else {
      state.apiConfigured = false;
      elements.apiStatusBadge.className = 'status-badge missing';
      elements.apiStatusText.textContent = 'API Key Needed (.env)';
      elements.apiStatusBadge.title =
        'Add GEMINI_API_KEY=your_key in your backend .env file to enable AI answers and quizzes.';
    }
  } catch (err) {
    console.warn('Could not contact backend status endpoint:', err);
    elements.apiStatusBadge.className = 'status-badge missing';
    elements.apiStatusText.textContent = 'Server Offline';
  }
}

// ==========================================
// 2. Event Listeners Setup
// ==========================================
function setupEventListeners() {
  // Tab Navigation
  elements.tabChat.addEventListener('click', () => switchTab('chatView'));
  elements.tabQuiz.addEventListener('click', () => switchTab('quizView'));

  // File Upload (Drop zone & Click)
  elements.dropZone.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', handleFileSelect);

  // Drag and Drop
  ['dragenter', 'dragover'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      elements.dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      elements.dropZone.classList.remove('dragover');
    });
  });

  elements.dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadPdfFile(files[0]);
    }
  });

  // Change PDF button
  elements.btnChangePdf.addEventListener('click', () => {
    elements.fileInput.value = '';
    elements.fileInput.click();
  });

  // Chat Form & Input
  elements.chatForm.addEventListener('submit', handleChatSubmit);
  elements.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      elements.chatForm.dispatchEvent(new Event('submit'));
    }
  });

  // Auto-resize chat textarea
  elements.chatInput.addEventListener('input', () => {
    elements.chatInput.style.height = 'auto';
    elements.chatInput.style.height = Math.min(elements.chatInput.scrollHeight, 120) + 'px';
  });

  // Clear Chat History
  elements.btnClearChat.addEventListener('click', () => {
    state.chatHistory = [];
    elements.chatMessages.innerHTML = '';
    appendMessage({
      role: 'bot',
      content: state.currentDocument
        ? `Chat cleared. Ready to answer questions about **${state.currentDocument.fileName}**!`
        : `Chat cleared. Please upload a PDF to begin study session.`,
    });
  });

  // Quick Study Starter Chips
  elements.promptChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const promptText = chip.getAttribute('data-prompt');
      if (!state.currentDocument) {
        alert('Please upload a PDF document first before using study starters.');
        return;
      }
      switchTab('chatView');
      elements.chatInput.value = promptText;
      elements.chatForm.dispatchEvent(new Event('submit'));
    });
  });

  // Quiz Generation Triggers
  elements.btnGenerateQuiz.addEventListener('click', triggerQuizGeneration);
  elements.btnEmptyGenerateQuiz.addEventListener('click', triggerQuizGeneration);
  elements.btnRegenerateQuiz.addEventListener('click', triggerQuizGeneration);
  elements.btnSummaryNew.addEventListener('click', triggerQuizGeneration);

  // Retake Quiz Triggers
  elements.btnResetQuiz.addEventListener('click', resetCurrentQuiz);
  elements.btnSummaryRetake.addEventListener('click', resetCurrentQuiz);
}

// ==========================================
// 3. Tab Switching
// ==========================================
function switchTab(targetTabId) {
  state.activeTab = targetTabId;

  if (targetTabId === 'chatView') {
    elements.tabChat.classList.add('active');
    elements.tabQuiz.classList.remove('active');
    elements.chatView.classList.add('active');
    elements.quizView.classList.remove('active');
    if (state.currentDocument) {
      elements.chatInput.focus();
    }
  } else {
    elements.tabQuiz.classList.add('active');
    elements.tabChat.classList.remove('active');
    elements.quizView.classList.add('active');
    elements.chatView.classList.remove('active');
  }
}

// ==========================================
// 4. File Upload & Processing
// ==========================================
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    uploadPdfFile(file);
  }
}

async function uploadPdfFile(file) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    alert('Invalid file format. Please upload a PDF file.');
    return;
  }

  // Show loading indicator in drop zone
  elements.uploadLoader.classList.remove('hidden');
  elements.dropZone.querySelector('.drop-zone-content').classList.add('hidden');
  elements.uploadLoaderText.textContent = `Extracting "${file.name}"...`;

  const formData = new FormData();
  formData.append('pdf', file);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to upload and parse PDF.');
    }

    // Update state with uploaded document
    state.currentDocument = data.document;

    // Update UI with document information
    renderDocumentInfo(data.document);

    // Enable chat input controls
    elements.chatInput.disabled = false;
    elements.btnSendChat.disabled = false;
    elements.chatDocStatus.textContent = `Active: ${data.document.fileName} (${data.document.pageCount} pages, ${data.document.wordCount} words)`;

    // Post announcement in chat
    appendMessage({
      role: 'bot',
      content: `📄 **"${data.document.fileName}"** has been loaded successfully!\n\n` +
        `• **Pages:** ${data.document.pageCount}\n` +
        `• **Word Count:** ${data.document.wordCount.toLocaleString()}\n` +
        `• **Size:** ${data.document.fileSize}\n\n` +
        `Ask me any question about this document, or click **Generate 10-Q Quiz** to test your knowledge!`,
    });

    // Update quiz empty state and buttons
    elements.quizDocLabel.textContent = `Document: ${data.document.fileName}`;

    // Prompt user to check API key if not configured
    if (!state.apiConfigured) {
      appendMessage({
        role: 'bot',
        content: `⚠️ **Note:** To enable AI answers and quiz generation, ensure you have set your \`GEMINI_API_KEY\` in the backend \`.env\` file.`,
      });
    }
  } catch (err) {
    console.error('Upload Error:', err);
    alert(`Upload failed: ${err.message}`);
  } finally {
    elements.uploadLoader.classList.add('hidden');
    elements.dropZone.querySelector('.drop-zone-content').classList.remove('hidden');
  }
}

function renderDocumentInfo(doc) {
  // Show uploaded PDF name prominently
  elements.docName.textContent = doc.fileName;
  elements.docName.title = doc.fileName;

  // Metadata tags
  elements.docPages.textContent = `${doc.pageCount} ${doc.pageCount === 1 ? 'Page' : 'Pages'}`;
  elements.docWords.textContent = `${doc.wordCount.toLocaleString()} Words`;
  elements.docSize.textContent = doc.fileSize;

  // Show active document card
  elements.documentCard.classList.remove('hidden');
}

// ==========================================
// 5. Chat Interface & Question Answering
// ==========================================
async function handleChatSubmit(e) {
  e.preventDefault();
  const question = elements.chatInput.value.trim();

  if (!question) return;

  if (!state.currentDocument) {
    alert('Please upload a PDF first to ask questions about it.');
    return;
  }

  // Clear input box
  elements.chatInput.value = '';
  elements.chatInput.style.height = 'auto';

  // Add user message to UI & history
  appendMessage({ role: 'user', content: question });
  state.chatHistory.push({ role: 'user', content: question });

  // Show typing indicator
  const typingIndicator = appendTypingIndicator();

  // Disable send button while awaiting response
  elements.btnSendChat.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: state.currentDocument.id,
        question,
        history: state.chatHistory.slice(-6), // Send last 3 dialog turns for context
      }),
    });

    const data = await res.json();

    // Remove typing indicator
    typingIndicator.remove();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to get answer from AI.');
    }

    // Add AI response to UI & history
    appendMessage({ role: 'bot', content: data.answer });
    state.chatHistory.push({ role: 'model', content: data.answer });
  } catch (err) {
    typingIndicator.remove();
    console.error('Chat error:', err);
    appendMessage({
      role: 'bot',
      content: `❌ **Error:** ${err.message}\n\n*If you haven't yet, please add \`GEMINI_API_KEY=your_key\` into your backend \`.env\` file and restart.*`,
    });
  } finally {
    elements.btnSendChat.disabled = false;
    elements.chatInput.focus();
  }
}

function appendMessage({ role, content }) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role === 'user' ? 'user-message' : 'bot-message'}`;

  const avatar = document.createElement('div');
  avatar.className = `message-avatar ${role === 'user' ? 'user-avatar' : 'bot-avatar'}`;
  avatar.textContent = role === 'user' ? 'You' : '🎓';

  const contentBox = document.createElement('div');
  contentBox.className = 'message-content';
  contentBox.innerHTML = renderMarkdown(content);

  messageEl.appendChild(avatar);
  messageEl.appendChild(contentBox);

  elements.chatMessages.appendChild(messageEl);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

  return messageEl;
}

function appendTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'message bot-message typing-message';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar bot-avatar';
  avatar.textContent = '🎓';

  const contentBox = document.createElement('div');
  contentBox.className = 'message-content';
  contentBox.innerHTML = `
    <div class="typing-dots">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;

  indicator.appendChild(avatar);
  indicator.appendChild(contentBox);

  elements.chatMessages.appendChild(indicator);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

  return indicator;
}

// Lightweight Markdown Formatter
function renderMarkdown(text) {
  if (!text) return '';

  let html = text
    // Escape standard HTML tags for safety
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks: ```code```
  html = html.replace(/```([a-z]*)\n([\s\S]*?)```/gi, '<pre><code>$2</code></pre>');

  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold: **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Headers: ### Header 3
  html = html.replace(/^### (.*$)/gim, '<h4 style="margin: 8px 0 4px; font-weight:700;">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin: 10px 0 6px; font-weight:700;">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 style="margin: 12px 0 8px; font-weight:800;">$1</h2>');

  // Bullet Lists: - item or * item
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gims, '<ul style="padding-left: 20px; margin: 6px 0;">$1</ul>');

  // Line breaks to paragraphs
  const paragraphs = html.split(/\n{2,}/);
  return paragraphs
    .map((p) => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<pre') || p.startsWith('<ul') || p.startsWith('<h')) return p;
      return `<p>${p.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('');
}

// ==========================================
// 6. Interactive 10-Question Quiz Generator
// ==========================================
async function triggerQuizGeneration() {
  if (!state.currentDocument) {
    alert('Please upload a PDF first so we can generate questions from its content.');
    return;
  }

  // Switch to Quiz Tab
  switchTab('quizView');

  // Display loading view
  elements.quizEmptyState.classList.add('hidden');
  elements.quizContainer.classList.add('hidden');
  elements.quizLoadingState.classList.remove('hidden');

  try {
    const res = await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: state.currentDocument.id,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to generate quiz.');
    }

    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error('No quiz questions were returned by the AI.');
    }

    state.currentQuiz = data.questions;
    state.quizAnswers = {};
    state.quizScore = 0;

    // Render questions
    renderQuizQuestions(data.questions);

    // Show quiz container
    elements.quizLoadingState.classList.add('hidden');
    elements.quizContainer.classList.remove('hidden');
    elements.quizSummaryCard.classList.add('hidden');
    updateQuizScoreDisplay();
  } catch (err) {
    console.error('Quiz generation error:', err);
    elements.quizLoadingState.classList.add('hidden');
    elements.quizEmptyState.classList.remove('hidden');
    alert(`Could not generate quiz: ${err.message}`);
  }
}

function renderQuizQuestions(questions) {
  elements.questionsList.innerHTML = '';
  const optionLetters = ['A', 'B', 'C', 'D'];

  questions.forEach((q, qIndex) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.id = `qCard_${qIndex}`;

    // Question header
    const header = document.createElement('div');
    header.className = 'question-header';
    header.innerHTML = `
      <span class="question-num">Q${qIndex + 1} of 10</span>
      <h4 class="question-title">${escapeHtml(q.question)}</h4>
    `;
    card.appendChild(header);

    // Options grid
    const optionsGrid = document.createElement('div');
    optionsGrid.className = 'options-grid';

    q.options.forEach((optText, optIndex) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.dataset.qIndex = qIndex;
      btn.dataset.optIndex = optIndex;

      btn.innerHTML = `
        <span class="option-letter">${optionLetters[optIndex] || optIndex + 1}</span>
        <span class="option-text">${escapeHtml(optText)}</span>
      `;

      btn.addEventListener('click', () => handleOptionClick(qIndex, optIndex));
      optionsGrid.appendChild(btn);
    });

    card.appendChild(optionsGrid);

    // Explanation Box (initially hidden)
    const explanationBox = document.createElement('div');
    explanationBox.className = 'explanation-box hidden';
    explanationBox.id = `explanation_${qIndex}`;
    explanationBox.innerHTML = `
      <strong>💡 Explanation & Document Context:</strong>
      ${escapeHtml(q.explanation)}
    `;
    card.appendChild(explanationBox);

    elements.questionsList.appendChild(card);
  });
}

function handleOptionClick(qIndex, selectedOptIndex) {
  // If already answered, do nothing
  if (state.quizAnswers[qIndex] !== undefined) return;

  state.quizAnswers[qIndex] = selectedOptIndex;
  const question = state.currentQuiz[qIndex];
  const isCorrect = selectedOptIndex === question.answer;

  if (isCorrect) {
    state.quizScore++;
  }

  // Update styles for this question's option buttons
  const card = document.getElementById(`qCard_${qIndex}`);
  const optionButtons = card.querySelectorAll('.option-btn');

  optionButtons.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === question.answer) {
      btn.classList.add('correct');
    } else if (idx === selectedOptIndex && !isCorrect) {
      btn.classList.add('incorrect');
    }
  });

  // Reveal explanation box
  const explanationBox = document.getElementById(`explanation_${qIndex}`);
  if (explanationBox) {
    explanationBox.classList.remove('hidden');
  }

  // Update score badge
  updateQuizScoreDisplay();

  // Check if all 10 questions have been answered
  const totalAnswered = Object.keys(state.quizAnswers).length;
  if (totalAnswered === state.currentQuiz.length) {
    showQuizSummary();
  }
}

function updateQuizScoreDisplay() {
  const answeredCount = Object.keys(state.quizAnswers).length;
  elements.quizScorePill.textContent = `Score: ${state.quizScore} / ${answeredCount} answered (of 10)`;
}

function showQuizSummary() {
  const total = state.currentQuiz.length;
  const score = state.quizScore;
  const percentage = Math.round((score / total) * 100);

  let emoji = '🏆';
  let title = 'Outstanding Mastery!';

  if (percentage < 50) {
    emoji = '📚';
    title = 'Keep Studying!';
  } else if (percentage < 80) {
    emoji = '👍';
    title = 'Good Effort!';
  }

  elements.summaryEmoji.textContent = emoji;
  elements.summaryTitle.textContent = title;
  elements.summaryScoreText.textContent = `You scored ${score} out of ${total} (${percentage}%)`;

  elements.quizSummaryCard.classList.remove('hidden');
  elements.quizSummaryCard.scrollIntoView({ behavior: 'smooth' });
}

function resetCurrentQuiz() {
  if (!state.currentQuiz || state.currentQuiz.length === 0) return;

  state.quizAnswers = {};
  state.quizScore = 0;

  renderQuizQuestions(state.currentQuiz);
  elements.quizSummaryCard.classList.add('hidden');
  updateQuizScoreDisplay();
  elements.quizContainer.scrollIntoView({ behavior: 'smooth' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
