# Sprekio - Senior Engineer Handoff Document

This document outlines the architecture, data flow, and key technical decisions for the Sprekio Chrome Extension and Cloudflare Worker backend. The system is designed to provide dual subtitles and instant hover-dictionary lookups on YouTube while aggressively minimizing LLM API costs and network latency.

## 1. Extension Architecture & Interception

YouTube aggressively protects its subtitle APIs (`/api/timedtext`) with rotating tokens (`potc`, `pot`, `signature`, `expire`). Simple `fetch()` calls to these URLs from an isolated content script result in `403 Forbidden` errors.

To bypass this, Sprekio uses a multi-tiered interception strategy:

1. **`interceptor.ts` (MAIN World, `document_start`)**:
   - Monkey-patches `window.fetch` and `XMLHttpRequest.prototype.open` directly in YouTube's execution context.
   - Catches the initial `/api/timedtext` requests and clones the JSON3 (`pb3`) responses.
   - Posts the URL (containing valid security tokens) and the response text to the ISOLATED world via `window.postMessage`.

2. **`earlyBuffer.ts` (ISOLATED World, `document_start`)**:
   - Because the React app (`index.tsx`) does not mount until `document_idle`, it will miss the initial network requests.
   - This script listens for `postMessage` events from `interceptor.ts` and buffers them into `window.__sprekioEarlyBuffer`.

3. **`index.tsx` (React App, `document_idle`)**:
   - On mount, it drains `__sprekioEarlyBuffer`.
   - Uses the intercepted URL's tokens to seamlessly request translated tracks (by injecting `&tlang=en` or `&tlang=de` into the intercepted URL).
   - If the interceptor misses the initial fetch, it uses a DOM scraper fallback to physically toggle the `ytp-subtitles-button` (CC button) to force a new network request.

## 2. Vocabulary Engine & Caching (The "Lightning Bolt" ⚡)

To ensure word translations appear instantly when hovered, Sprekio uses aggressive predictive prefetching. 

1. **Rolling Prefetch**: 
   - When the transcript loads, the first 20 subtitles are immediately batched and sent to the backend.
   - As the video plays, a rolling window of the next 15 upcoming subtitles is continuously tokenized and prefetched.
   - *Crucial Decision*: We prefetch **all** words, including common function words (der, die, ich). Skipping them would cause cache-misses and forced live API lookups on hover, creating noticeable UI delay.
2. **Local Cache**: 
   - Prefetched words are stored in an `IndexedDB` cache and an in-memory `Map`. 
   - When the user hovers a word, the UI reads synchronously from memory. If the word was served from cache, it displays a `⚡` icon.

## 3. Backend & AI Disambiguation (Cloudflare Workers)

The backend is built on Cloudflare Workers and a D1 SQLite database (hosting the parsed Kaikki dictionary). To minimize LLM costs, resolution follows a strict hierarchy:

1. **D1 Lexical Lookup**: Fetches all possible meanings for the word.
2. **Deterministic Contextual Ranking**: The backend attempts to determine the correct sense based on surrounding sentence context (using a lightweight scoring algorithm) *without* invoking AI.
3. **AI Fallback (NVIDIA)**: If the word is highly ambiguous and deterministic ranking fails, the backend queries the NVIDIA API (`openai/gpt-oss-20b`, as of 2026-08 — Meta retired the `llama-3.1-*-instruct` family on NVIDIA's hosted API) to pick the exact `candidateSenseId`. Model names here are not stable long-term; if AI calls start failing with an "end of life" error, check `https://integrate.api.nvidia.com/v1/models` (public, no auth needed) for currently available models.
4. **AI Caching**: The AI's decision is permanently cached in D1 (`ai_cache`) keyed by a SHA-256 hash of the sentence and word. This ensures we never pay for the same sentence twice across all users.

## 4. Google OAuth & Identity

The extension uses Firebase Auth via `chrome.identity.getAuthToken`. 

**The Unpacked Extension ID Fix:**
By default, loading an "unpacked" extension on different computers (e.g., Windows vs. MacBook) generates different Extension IDs based on the local file path. Because Google Cloud OAuth restricts logins to specific Extension IDs, this breaks cross-device development. 
*Fix*: We hardcoded a permanent public `"key"` in `manifest.json`. This forces Chrome to generate the exact same Extension ID (`mckjbdlgmkfmbhpglkgkpjdlnlggfidj`) on every machine, ensuring Google Login works flawlessly in development.

## 5. UI Synchronization

- Subtitle sync relies on a high-precision `requestAnimationFrame` loop tracking the video's `currentTime`.
- The English auto-translation is matched to the German subtitle by stripping punctuation/spacing and comparing the live DOM text (`liveText`) directly against the cached transcript arrays. This ensures the English translation perfectly aligns with what is visually rendered on screen, regardless of YouTube's cue chunking behavior.
- Scrollbars have been explicitly hidden (`overflow: hidden`) on the hover popup for a cleaner aesthetic.
