import { loginWithGoogle, saveVocabularyWord, getVocabularyWords, auth, deleteVocabWord, updateVocabWordStatus } from './firebase';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "fetchTranscriptDirect") {
    // The web app asks us to fetch the transcript, bypassing datacenter blocks!
    fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      credentials: "omit", // or "include" to use user's session
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
        videoId: request.videoId
      })
    })
    .then(async r => {
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text.substring(0, 200)}`);
      }
      return r.json();
    })
    .then(data => {
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!tracks || tracks.length === 0) {
        throw new Error("No captions found for this video.");
      }
      const track = tracks.find((t: any) => t.languageCode === 'de') || tracks[0];
      return fetch(track.baseUrl);
    })
    .then(r => r.text())
    .then(xml => {
       sendResponse({ xml });
    })
    .catch(e => {
       sendResponse({ error: e.message });
    });
    return true; // async
  }

  if (request.action === "translate") {
    handleTranslation(request.word, request.contextSentence, request.provider).then(sendResponse);
    return true; // Keep message channel open for async response
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
    fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
        videoId: request.videoId
      })
    })
    .then(async r => {
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text.substring(0, 200)}`);
      }
      return r.json();
    })
    .then(data => {
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!tracks || !tracks.length) throw new Error("No tracks found");
      let track = tracks.find((t: any) => t.languageCode === request.lang) || tracks[0];
      let url = track.baseUrl;
      if (request.forceLang) {
        url += "&tlang=" + request.forceLang;
      }
      return fetch(url, { credentials: "omit" }).then(r => r.text());
    })
    .then(xml => sendResponse({ xml }))
    .catch((e: any) => sendResponse({ error: e.message }));
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
    const response = await fetch(`https://sprekio-backend.khaleel-eu.workers.dev/api/translate-sentence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, provider: provider || "gemini" })
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

async function handleTranslation(word: string, contextSentence: string, provider?: string) {
  try {
    const response = await fetch(`https://sprekio-backend.khaleel-eu.workers.dev/api/translate-word`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, contextSentence, provider: provider || "gemini" })
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error("API Error:", result);
      const errMsg = result.error?.message || result.error || "API request failed";
      if (response.status === 429 || String(errMsg).includes("Quota exceeded")) {
        return {
          translation: "Rate Limit Exceeded (Please wait)",
          type: "error"
        };
      }
      return {
        translation: String(errMsg).substring(0, 50) + "...",
        type: "error"
      };
    }

    if (result.candidates?.[0]?.finishReason === 'SAFETY') {
      return {
        translation: "Blocked by safety filter",
        type: "error"
      };
    }
    
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return JSON.parse(rawText);
  } catch (error: any) {
    console.error("Failed to fetch translation:", error);
    return {
      translation: "Network error",
      type: "error"
    };
  }
}
