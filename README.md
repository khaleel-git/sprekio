# Sprekio 🇩🇪

**Sprekio** is a powerful, privacy-first Chrome Extension that transforms YouTube into an immersive language-learning environment. Whether you are a beginner or looking to achieve fluency, Sprekio provides dual subtitles, instant hover dictionaries, and AI-powered translations to help you master languages naturally while watching your favorite videos.

---

## ✨ Features

- **Dual Subtitles:** Watch videos with native German subtitles and English translations side-by-side.
- **Zero-Latency Native Translation:** Leverages YouTube's native auto-translate for instant, free translations without needing an API key.
- **AI Fallback Translation (BYOK):** Bring your own API key to seamlessly fall back to **Google Gemini** or **Nvidia Llama 3** for perfectly accurate, context-aware translations when native tracks are unavailable.
- **Hover Dictionary:** Hover over any word to instantly pause the video and reveal its definition, gender, and part-of-speech.
- **Vocabulary Manager:** Save tricky words directly to your personal vocabulary list for future review.
- **Customizable UI:** Easily adjust subtitle positions, text sizes, background styles (solid/glassmorphism), and auto-pause behavior directly from the YouTube player.

---

## 🚀 Installation Guide

Sprekio runs entirely in your browser. Since it utilizes a **Bring Your Own Key (BYOK)** model for AI features, you simply build the extension and install it locally.

### 1. Build the Extension

Open your terminal, navigate to the extension folder, and build the project:

```bash
cd "Chrome Extension"
npm install
npm run build
```

### 2. Load into Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** ON in the top right corner.
3. Click **Load unpacked** in the top left.
4. Select the `dist` folder located inside the `Chrome Extension` directory (`Chrome Extension/dist`).

---

## 🛠️ Configuration & Usage

1. **Start Watching:** Navigate to any German YouTube video (or your target language).
2. **Enable Captions:** Ensure YouTube's Closed Captions (CC) are turned **ON**.
3. **Configure AI Settings:** Click the new **Sprekio Settings Gear (⚙️)** added to the YouTube player controls. 
4. **Add Your API Key:** If you want to use advanced AI translations instead of YouTube's native engine, select **Gemini** or **Nvidia** from the AI Provider dropdown and securely paste your personal API key into the input field. 
5. **Learn:** Hover over any word in the subtitles to see its definition, and use the gear menu to customize your learning layout!

*Note: Your API keys are securely stored in your local Chrome browser storage and are never saved or exposed to external servers outside of direct translation requests.*

---

## 📝 Technologies Used

- **Frontend Extension:** React 19, Vite, Tailwind CSS v4, CRXJS Vite Plugin
- **Dictionary & Sync Backend:** Cloudflare Workers, Hono, Cloudflare D1 (SQLite)
