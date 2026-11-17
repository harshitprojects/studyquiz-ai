# AI Study Assistant Web App 🎓

A modern, responsive web application designed for students and researchers. Upload any PDF study material (lecture notes, textbook chapters, scientific papers), chat interactively with your document using grounded AI responses, and generate instant 10-question multiple-choice quizzes with explanations.

---

## 🌟 Key Features

1. **Modern Responsive UI**: Clean interface built with modern CSS variables, split view layout, and mobile-friendly adaptations.
2. **PDF Upload & Metadata**: Drag-and-drop or file picker with instant extraction of document name, page count, word count, and file size.
3. **Document-Grounded Chat**: AI strictly answers questions based on the PDF content, refusing to hallucinate or guess external facts.
4. **10-Question Quiz Generator**: Generates 10 multiple-choice questions with 4 options each, interactive answer selection, instant correctness feedback, live score tracking, and detailed explanations citing document context.
5. **Secure Architecture**: API keys are strictly kept on the backend using environment variables (`.env`). No keys are exposed to the browser.
6. **AI Provider Support**: Uses Google Gemini API (`gemini-2.5-flash`) by default with free tier availability, plus OpenAI fallback support.

---

## 📂 Project Structure

```
ai-study-assistant-web-app/
├── public/
│   ├── index.html        # Modern frontend interface (chat & quiz tabs)
│   ├── style.css         # Modern styling, animations, responsive design
│   └── app.js            # Client-side logic (file upload, chat, quiz state)
├── services/
│   ├── aiService.js      # Backend AI provider integration (Gemini / OpenAI)
│   └── pdfService.js     # PDF text extraction and metadata parser
├── .env.example          # Template for environment variables
├── .env                  # Local environment file with API key (git-ignored)
├── .gitignore            # Git ignore rules
├── package.json          # Node.js dependencies and run scripts
├── README.md             # Project documentation
└── server.js             # Express.js backend server and API endpoints
```

---

## 🛠️ Prerequisites

- **Node.js**: v18.0.0 or later (v24 recommended).
- **Google Gemini API Key** (Free): Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey).

---

## 🚀 How to Run Locally

### 1. Install Dependencies
Open your terminal in the project directory and install the packages:
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Open `.env` in any text editor and paste your Gemini API key:
```env
PORT=3000
GEMINI_API_KEY=AIzaSy...your_actual_key_here
GEMINI_MODEL=gemini-2.5-flash
```

### 3. Start the Server
Run the production start command:
```bash
npm start
```
Or run with auto-reload during development:
```bash
npm run dev
```

### 4. Open in Your Browser
Visit:
```
http://localhost:3000
```

---

## 🧪 How to Use the App

1. **Upload your PDF**: Click or drag a PDF into the upload area on the left.
2. **Review Document Stats**: The document card displays the file name, page count, and word count.
3. **Chat with the Document**:
   - Ask specific questions about definitions, theories, or formulas.
   - Use the pre-built study starter chips (e.g. *5-Point Summary*, *Key Terms & Definitions*, *Explain Simply*).
   - If a question asks for something not in the PDF, the AI will explicitly state that the document does not cover it.
4. **Generate 10-Question Quiz**:
   - Click the **"Generate 10-Q Quiz"** button in the sidebar or switch to the **"Practice Quiz"** tab.
   - Answer the 10 multiple-choice questions by clicking options (A, B, C, D).
   - Instant visual feedback shows whether your answer was correct or incorrect, reveals the right answer, updates your live score, and reveals an explanation grounded in the text.
   - Retake or generate a fresh set of questions at any time.

---

## 🔒 Security Best Practices

- **Zero Client-Side Secrets**: All calls to AI APIs are made exclusively on the server (`server.js` and `services/aiService.js`).
- **In-Memory Uploads**: Multer memory storage parses files in RAM with a 25MB safety limit, avoiding unmonitored disk storage leaks.
