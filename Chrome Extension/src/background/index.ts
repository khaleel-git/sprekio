import { loginWithGoogle, saveVocabularyWord, getVocabularyWords, auth, deleteVocabWord, updateVocabWordStatus } from './firebase';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
  if (request.action === "fetchSubtitles") {
    fetch(request.url, {
      headers: request.headers || {},
      credentials: "include"
    })
      .then(res => res.json())
      .then(sendResponse)
      .catch(e => sendResponse({ error: e.message }));
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
