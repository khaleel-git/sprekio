import { loginWithGoogle, saveVocabularyWord, getVocabularyWords, auth, deleteVocabWord, updateVocabWordStatus } from './firebase';

// A hung upstream call (AI provider or D1 taking forever) would otherwise leave the
// content script's popup stuck on "Translating..." forever, since nothing ever
// resolves or rejects. Cap every backend call so it always settles one way or another.
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {

  // Service worker keepalive — content scripts ping to wake the SW before critical calls
  if (request.action === "ping") {
    sendResponse({ pong: true });
    return true;
  }


  if (request.action === "translate") {
    handleTranslation(request.word, request.contextSentence, request.provider, request.skipAi).then(sendResponse);
    return true; // Keep message channel open for async response
  }

  if (request.action === "batchLookup") {
    handleBatchLookup(request.words, request.sentence).then(sendResponse);
    return true;
  }
  
  if (request.action === "login") {
    loginWithGoogle()
      .then((user: any) => sendResponse({ success: true, user: { uid: user.uid, email: user.email } }))
      .catch((error: any) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "checkAuth") {
    const user = auth.currentUser;
    sendResponse({ loggedIn: !!user, user: user ? { uid: user.uid, email: user.email } : null });
    return true;
  }

  if (request.action === "saveWord") {
    saveVocabularyWord(request.word, request.translationData, request.contextSentence, request.videoId, request.videoTitle)
      .then(() => sendResponse({ success: true }))
      .catch((error: any) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "getWords") {
    getVocabularyWords()
      .then((words) => sendResponse({ success: true, words }))
      .catch((error: any) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (request.action === "fetchInMainWorld" && _sender.tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: _sender.tab.id },
      world: "MAIN",
      func: async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error("HTTP " + res.status);
          const text = await res.text();
          if (!text) throw new Error("Empty body");
          return text;
        } catch (e: any) {
          return { error: e.message };
        }
      },
      args: [request.url]
    }).then(results => {
      const result = results?.[0]?.result;
      if (result && typeof result === 'object' && result.error) {
        sendResponse({ error: result.error });
      } else {
        sendResponse({ text: result });
      }
    }).catch(e => {
      sendResponse({ error: e.message });
    });
    return true;
  }

  if (request.action === "fetchSubtitles") {
    fetch(request.url, {
      credentials: "include"
    })
      .then(async res => {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
        }
        if (!text) {
          throw new Error("Empty response body");
        }
        return { text };
      })
      .then(sendResponse)
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }
  
  if (request.action === "fetchTranscriptDirect") {
    (async () => {
      try {
        const res = await fetch(`https://www.youtube.com/watch?v=${request.videoId}`, {
          headers: {
            "Accept-Language": "en-US,en;q=0.9"
          },
          credentials: "include"
        });
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        
        const html = await res.text();
        
        let data;
        const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/);
        if (match) {
          data = JSON.parse(match[1]);
        } else {
          const match2 = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*<\//);
          if (match2) {
            data = JSON.parse(match2[1]);
          } else {
            throw new Error("Could not find ytInitialPlayerResponse in HTML. Video might be age-restricted or unavailable.");
          }
        }
        
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!tracks || !tracks.length) {
          throw new Error("Transcript is disabled on this video (or it does not exist).");
        }
        
        let track = tracks.find((t: any) => t.languageCode === (request.lang || 'de')) || tracks[0];
        let url = track.baseUrl;
        
        if (request.forceLang) {
          url += "&tlang=" + request.forceLang;
        }
        
        const xmlRes = await fetch(url);
        const xml = await xmlRes.text();
        sendResponse({ xml });
        
      } catch (error: any) {
        console.error("fetchTranscriptDirect error:", error);
        sendResponse({ error: error.message || String(error) });
      }
    })();
    return true;
  }
  if (request.action === "translateSentence") {
    handleSentenceTranslation(request.text, request.provider).then(sendResponse);
    return true;
  }
  if (request.action === "deleteWord") {
    deleteVocabWord(request.id)
      .then(() => sendResponse({ success: true }))
      .catch((error: any) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (request.action === "updateWordStatus") {
    updateVocabWordStatus(request.id, request.status)
      .then(() => sendResponse({ success: true }))
      .catch((error: any) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "extractYouTubeTracks") {
    const tabId = _sender.tab?.id;
    if (tabId) {
      chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (vidId) => {
          try {
            let tracks = [];
            const player = document.getElementById('movie_player') as any;
            if (player && typeof player.getPlayerResponse === 'function') {
              const response = player.getPlayerResponse();
              if (response?.videoDetails?.videoId === vidId) {
                tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
              }
            } 
            if (!tracks.length && (window as any).ytInitialPlayerResponse?.videoDetails?.videoId === vidId) {
              tracks = (window as any).ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
            }
            return tracks;
          } catch (e) {
            return [];
          }
        },
        args: [request.videoId]
      }).then((results) => {
        if (results && results[0] && results[0].result) {
          sendResponse({ tracks: results[0].result });
        } else {
          sendResponse({ tracks: [] });
        }
      }).catch((e) => {
        console.error(e);
        sendResponse({ tracks: [] });
      });
      return true;
    }
    sendResponse({ tracks: [] });
    return true;
  }
});

async function handleSentenceTranslation(text: string, provider?: string) {
  try {
    const response = await fetchWithTimeout(`https://sprekio-backend.khaleel-eu.workers.dev/api/translate-sentence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, provider: provider || "nvidia" })
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("Sentence Translation API Error:", result);
      const errMsg = result.error?.message || result.error || response.statusText;
      if (response.status === 429 || String(errMsg).includes("Quota exceeded")) {
        return { translation: "⚠️ API Rate Limit Exceeded (Please pause for a moment)" };
      }
      return { translation: "API Error: " + String(errMsg).substring(0, 50) + "..." };
    }
    
    if (result.candidates?.[0]?.finishReason === 'SAFETY') {
      return { translation: "(Translation blocked by AI safety filter)" };
    }
    
    let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    rawText = rawText.replace(/^["']|["']$/g, '').trim(); // Remove leading/trailing quotes if the model added them
    return { translation: rawText || "..." };
  } catch (error: any) {
    console.error("Failed to translate sentence:", error);
    return { translation: "Network error" };
  }
}

async function handleTranslation(word: string, contextSentence: string, provider?: string, skipAi?: boolean) {
  try {
    // skipAi=true asks for the D1-only lexical answer (near-instant — no NVIDIA call).
    // Give that path a short timeout since it should never legitimately take long; the
    // full/AI-disambiguation follow-up call keeps the longer 12s budget.
    const response = await fetchWithTimeout(`https://sprekio-backend.khaleel-eu.workers.dev/api/translate-word`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, contextSentence, provider: provider || "nvidia", skipAi: !!skipAi })
    }, skipAi ? 5000 : 12000);

    const result = await response.json();
    
    if (!response.ok) {
      console.error("API Error:", result);
      const errMsg = result.error?.message || result.error || "API request failed";
      if (response.status === 429 || String(errMsg).includes("Quota exceeded")) {
        return {
          surface: word,
          normalized: word.toLowerCase(),
          lemma: word,
          translations: [{ text: "Rate Limit Exceeded (Please wait)" }],
          source: "ai",
          cached: false,
          confidence: 0
        };
      }
      return {
        surface: word,
        normalized: word.toLowerCase(),
        lemma: word,
        translations: [{ text: String(errMsg).substring(0, 50) + "..." }],
        source: "ai",
        cached: false,
        confidence: 0
      };
    }

    // Backend returns { status: 'found', result: ... } on a hit, or just
    // { status: 'not_found', surface } when the word isn't in the dictionary — that shape
    // has no `translations`, which used to render as a silent blank instead of an answer.
    if (result.result) return result.result;
    return {
      surface: word,
      normalized: word.toLowerCase(),
      lemma: word,
      translations: [{ text: "No translation found" }],
      source: "dictionary",
      cached: false,
      confidence: 0
    };
  } catch (error: any) {
    console.error("Failed to fetch translation:", error);
    const isTimeout = error?.name === "AbortError";
    return {
      surface: word,
      normalized: word.toLowerCase(),
      lemma: word,
      translations: [{ text: isTimeout ? "Timed out — try again" : "Network error" }],
      source: "ai",
      cached: false,
      confidence: 0
    };
  }
}

async function handleBatchLookup(words: string[], sentence: string) {
  try {
    const response = await fetchWithTimeout(`https://sprekio-backend.khaleel-eu.workers.dev/api/dictionary/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words, sentence })
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("Batch API Error:", result);
      return { results: [] };
    }

    return result;
  } catch (error: any) {
    console.error("Failed to fetch batch lookup:", error);
    return { results: [] };
  }
}
