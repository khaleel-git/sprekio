# Sprekio 🌍

Sprekio is a powerful Chrome Extension that transforms YouTube into an immersive language-learning environment. It provides dual subtitles, instant word definitions via hover, vocabulary saving, and AI-powered translations to help you master languages naturally while watching videos.

Built with **React, Vite, Tailwind CSS** on the frontend, and powered by a **Cloudflare Workers** backend utilizing **D1 Databases** and **AI models** (Google Gemini & Nvidia Llama).

---

## ✨ Features

- **Dual Subtitles:** Watch videos with native German subtitles and English translations side-by-side.
- **Zero-Latency Native Translation:** Leverages YouTube's native auto-translate for instant, free translations.
- **AI Fallback Translation:** Seamlessly falls back to Google Gemini (3.8 Flash) or Nvidia AI for perfectly accurate translations when native tracks are unavailable.
- **Hover Dictionary:** Hover over any word to pause the video and instantly get its definition, gender, and part-of-speech.
- **Vocabulary Manager & Quizzes:** Save tricky words to your personal vocabulary list and test your knowledge with auto-generated quizzes.
- **Customizable UI:** Adjust subtitle positions, sizes, styling (solid/glassmorphism), and auto-pause behavior directly from the on-screen settings menu.

---

## 📂 Project Structure

- `/Chrome Extension`: The frontend Chrome Extension (Manifest V3, React, CRXJS).
- `/backend`: The Cloudflare Worker API (Hono, D1 Database, AI fetching logic).

---

## 🚀 Installation & Setup

### 1. Backend Setup (Cloudflare Workers)

The backend handles vocabulary storage and AI translation requests.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up the D1 Database:
   ```bash
   npx wrangler d1 create sprekio-dictionary
   ```
   *Note: Update the `database_id` in `wrangler.toml` with the ID provided by the command.*
4. **Bring Your Own Key (BYOK)**: API keys are securely stored locally in the extension. Users must enter their own Google Gemini or Nvidia API Key directly into the Sprekio Settings Gear on YouTube.
5. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```

### 2. Frontend Setup (Chrome Extension)

1. Navigate to the extension directory:
   ```bash
   cd "Chrome Extension"
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension for production:
   ```bash
   npm run build
   ```
4. Load the extension into Chrome:
   - Open Google Chrome and go to `chrome://extensions/`
   - Turn on **"Developer mode"** in the top right corner.
   - Click **"Load unpacked"** and select the `dist` folder located inside the `Chrome Extension` directory (`Chrome Extension/dist`).

---

## 🛠️ Usage

1. Go to any German YouTube video (or your target language).
2. Ensure YouTube's Closed Captions (CC) are turned **ON**.
3. A new **Sprekio Settings Gear (⚙️)** will appear in the YouTube player controls.
4. Click the gear to customize your AI Provider, translation toggles, and subtitle appearance.
5. Hover over any word in the subtitles to see its definition and add it to your Vocab list!

---

## 📝 Technologies Used
- **Frontend:** React 19, Vite, Tailwind CSS v4, CRXJS Vite Plugin
- **Backend:** Cloudflare Workers, Hono, Cloudflare D1 (SQLite)
- **AI Models:** Google Gemini (gemini-3.8-flash) / Nvidia Llama 3
