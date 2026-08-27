import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import '../index.css';

export interface SprekioTranslation {
  text: string;
  definition?: string;
  confidence?: number;
}
import { VocabularyEngine } from './vocabulary';

const SprekioOverlay: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false); // Default false, will sync from storage
  const [autoPause, setAutoPause] = useState(false);
  const provider = "nvidia";
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'transcript' | 'vocab' | 'quiz'>('transcript');
  const [subtitleStyle, setSubtitleStyle] = useState<'solid' | 'transparent'>('solid');
  const [savedWords, setSavedWords] = useState<any[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizOrder, setQuizOrder] = useState<any[]>([]);
  const [transcript, setTranscript] = useState<{start: number, end: number, deText: string, enText: string, deWordTimings?: {text: string, startMs: number}[]}[]>([]);
  const [activeTranscriptIndex, setActiveTranscriptIndex] = useState(-1);
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false);
  const [captionsUnavailable, setCaptionsUnavailable] = useState(false);
  
  const [liveText, setLiveText] = useState("");
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [translatedText, setTranslatedText] = useState("");
  const [hoveredWord, setHoveredWord] = useState<{ word: string, rect: DOMRect } | null>(null);
  const [wordDetails, setWordDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hideTimeout = useRef<number | null>(null);
  const wordCache = useRef<Record<string, any>>({});
  const activeWordIndexRef = useRef(-1);
  const lastPausedIndex = useRef(-1);
  const resumeGuardIndex = useRef(-1);
  const prevTimeRef = useRef(0);
  const currentLineIndexRef = useRef(-1);

  const interceptedTranscripts = useRef<{url: string, text: string, status: number, headers: any[]}[]>([]);
  const sentenceTranslationCache = useRef<Record<string, string>>({});
  const sentenceTranslateTimeout = useRef<number | null>(null);
  const liveTextRef = useRef("");

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'SPREKIO_INTERCEPTED') {
         console.log("[Sprekio] Content Script received intercepted transcript:", e.data);
         interceptedTranscripts.current.push(e.data);
      }
    };
    window.addEventListener('message', handleMessage);

    // Drain messages buffered by earlyBuffer.ts (ISOLATED world, document_start).
    // earlyBuffer.ts listens for SPREKIO_INTERCEPTED from the moment the page starts
    // loading, so no XHR messages are lost due to the React document_idle mount delay.
    const buffer: any[] = (window as any).__sprekioEarlyBuffer || [];
    if (buffer.length > 0) {
      console.log(`[Sprekio] Draining ${buffer.length} early-buffered transcript(s)`);
      buffer.forEach(msg => {
        if (!interceptedTranscripts.current.some(t => t.url === msg.url && t.status === msg.status)) {
          console.log("[Sprekio] Recovered early transcript:", msg.url);
          interceptedTranscripts.current.push(msg);
        }
      });
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Proactively wake the MV3 service worker on mount and keep it warm every 25s.
  // MV3 SWs sleep after ~30s idle; a sleeping SW causes the first sendMessage to fail.
  useEffect(() => {
    const pingServiceWorker = () => {
      try {
        chrome.runtime.sendMessage({ action: "ping" }, () => {
          void chrome.runtime.lastError; // suppress unchecked lastError warning
        });
      } catch (e) {
        // Extension context invalidated after reload — ignore
      }
    };
    pingServiceWorker(); // Wake immediately on mount
    const interval = setInterval(pingServiceWorker, 25000);
    return () => clearInterval(interval);
  }, []);

  const fetchTranscript = async (retryCount = 0) => {
    if (transcript.length > 0) return;
    if (retryCount === 0 && isFetchingTranscript) return;
    
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) return;

    setIsFetchingTranscript(true);
    setCaptionsUnavailable(false);

    // Force CC on so the native player requests transcripts
    const ccButton = document.querySelector('.ytp-subtitles-button') as HTMLButtonElement;
    if (ccButton) {
      if (ccButton.getAttribute('aria-pressed') === 'true') {
        if (interceptedTranscripts.current.length === 0) {
          console.log("[Sprekio] CC is on but we missed the initial fetch. Toggling to re-fetch.");
          ccButton.click(); // turn off
          await new Promise(r => setTimeout(r, 100));
          ccButton.click(); // turn on
          await new Promise(r => setTimeout(r, 1500));
        }
      } else {
        console.log("[Sprekio] Forcing CC on to trigger native transcript fetch");
        ccButton.click();
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    
    try {
      const getTracksFromDOM = async () => {
        return new Promise<any[]>((resolve) => {
          chrome.runtime.sendMessage({ action: "extractYouTubeTracks", videoId }, (res) => {
            resolve(res?.tracks || []);
          });
        });
      };
      
      const captionTracks = await getTracksFromDOM();
      
      if (!captionTracks || captionTracks.length === 0) {
        throw new Error("Parsed captionTracks is empty (DOM extraction failed)");
      }

      // Find German track
      let deTrack = captionTracks.find((t: any) => t.languageCode === 'de' && !t.vssId.includes('a.')) || 
                    captionTracks.find((t: any) => t.languageCode === 'de');
                    
      // Find English track (native or auto-translated)
      let enTrack = captionTracks.find((t: any) => t.languageCode === 'en' && !t.vssId.includes('a.')) || 
                    captionTracks.find((t: any) => t.languageCode === 'en');
                    
      let defaultTrack = captionTracks[0];
      
      const decodeEntities = (text: string) => {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
      };

      const parseTranscriptXml = (xml: string) => {
        const results = [];
        const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
        let match;
        while ((match = pRegex.exec(xml)) !== null) {
            const startMs = parseInt(match[1], 10);
            const durMs = parseInt(match[2], 10);
            const inner = match[3];
            let text = '';
            const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
            let sMatch;
            while ((sMatch = sRegex.exec(inner)) !== null) {
                text += sMatch[1];
            }
            if (!text) {
                text = inner.replace(/<[^>]+>/g, '');
            }
            text = decodeEntities(text).trim();
            if (text) {
                results.push({
                    text,
                    duration: durMs,
                    offset: startMs,
                });
            }
        }
        if (results.length > 0) return results;
        
        const classicRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
        const classicResults = [...xml.matchAll(classicRegex)];
        return classicResults.map((result) => ({
            text: decodeEntities(result[3]),
            duration: parseFloat(result[2]) * 1000,
            offset: parseFloat(result[1]) * 1000,
        }));
      };

      const fetchTrack = async (track: any, forceLang?: string) => {
        if (!track) return null;
        let baseUrl = track.baseUrl;
        if (forceLang) baseUrl += "&tlang=" + forceLang;

        const tryFetch = async (url: string, isJson: boolean) => {
          console.log(`[Sprekio] Fetching ${isJson ? 'JSON3' : 'XML'}: ${url}`);

          // 1. Check if we intercepted this request from the native player!
          const baseUrlWithoutQuery = url.split('?')[0];
          const intercepted = interceptedTranscripts.current.find(t => 
             t.url.includes(baseUrlWithoutQuery) && t.status === 200 && t.text.length > 50
          );
          
          let fetchUrl = url;
          if (intercepted) {
             console.log(`[Sprekio] Found matching INTERCEPTED transcript in cache!`, intercepted.url);
             
             // If this request needs a translation (tlang), we CANNOT use the cached text.
             // We must fetch from network using the intercepted URL's tokens (signature, pot, etc).
             if (url.includes('tlang=')) {
               const tlangMatch = url.match(/tlang=([^&]+)/);
               if (tlangMatch) {
                 fetchUrl = intercepted.url + `&tlang=${tlangMatch[1]}`;
                 console.log("[Sprekio] Rewrote URL to use intercepted tokens for translation:", fetchUrl);
               }
             } else {
               // If no translation needed, just return the cached text directly!
               try {
                  const forceJson = intercepted.url.includes('fmt=json3') || isJson;
                  return { data: forceJson ? JSON.parse(intercepted.text) : parseTranscriptXml(intercepted.text), isJson: forceJson };
               } catch(e) {
                  console.error("[Sprekio] Error parsing intercepted text:", e);
               }
             }
          }

          const forceJsonParse = fetchUrl.includes('fmt=json3') || isJson;

          try {
            const localRes = await fetch(fetchUrl);
            const text = await localRes.text();
            console.log(`[Sprekio] Isolated World Fetch - Status: ${localRes.status}, Content-Type: ${localRes.headers.get('content-type')}, Redirected: ${localRes.redirected}, URL: ${localRes.url}, Text (200): ${text.substring(0, 200)}`);
            if (localRes.ok && text) {
              return { data: forceJsonParse ? JSON.parse(text) : parseTranscriptXml(text), isJson: forceJsonParse };
            }
          } catch (e) {
            console.error(`[Sprekio] Isolated World Fetch Exception:`, e);
          }

          try {
            const mainRes = await new Promise<any>((resolve) => {
              chrome.runtime.sendMessage({ action: "fetchInMainWorld", url: fetchUrl }, resolve);
            });
            console.log(`[Sprekio] Main World Fetch - Response:`, mainRes);
            if (mainRes && !mainRes.error && mainRes.text) {
               return { data: forceJsonParse ? JSON.parse(mainRes.text) : parseTranscriptXml(mainRes.text), isJson: forceJsonParse };
            }
          } catch(e) {
            console.error(`[Sprekio] Main World Fetch Exception:`, e);
          }

          const res = await new Promise<any>((resolve) => {
            chrome.runtime.sendMessage({ action: "fetchSubtitles", url: fetchUrl }, resolve);
          });
          console.log(`[Sprekio] Background Service Fetch - Response:`, res);
          if (res && res.error) throw new Error(res.error);
          return { data: forceJsonParse ? JSON.parse(res.text) : parseTranscriptXml(res.text || ""), isJson: forceJsonParse };
        };

        try {
          // Try JSON3 first. The actual parsed shape (isJson) may differ from what was
          // requested if a cached/rewritten URL forced a different format — trust it, not
          // the request intent, or normalizeEvents will crash on a shape mismatch.
          const result = await tryFetch(baseUrl + "&fmt=json3", true);
          if (!result) throw new Error("No data returned");
          return { data: result.data, type: result.isJson ? 'json' : 'xml' };
        } catch (e) {
          console.warn("JSON3 fetch failed, trying XML...", e);
          try {
            // Try standard XML
            const result = await tryFetch(baseUrl, false);
            if (!result) throw new Error("No data returned");
            return { data: result.data, type: result.isJson ? 'json' : 'xml' };
          } catch (err) {
            console.error("Both JSON3 and XML fetches failed", err);
            
            // MASTER FALLBACK: Direct InnerTube API fetch via Background Script
            console.warn("Attempting direct InnerTube API fetch fallback...");
            
            // get videoId from window or url
            const vidId = new URLSearchParams(window.location.search).get('v') || '';
            const res = await new Promise<any>((resolve) => {
              chrome.runtime.sendMessage({ 
                action: "fetchTranscriptDirect", 
                videoId: vidId, 
                lang: track.languageCode,
                forceLang: forceLang
              }, resolve);
            });
            console.log(`[Sprekio] InnerTube Fallback - Response:`, res);
            if (res && res.error) throw new Error(res.error);
            if (res && res.xml) {
                return { data: parseTranscriptXml(res.xml), type: 'xml' };
            }
            return null;
          }
        }
      };

      const deData = await fetchTrack(deTrack || defaultTrack, !deTrack ? 'de' : undefined);
      let enData = null;
      try {
        enData = await fetchTrack(enTrack || defaultTrack, !enTrack ? 'en' : undefined);
      } catch (e) {
        console.warn("[Sprekio] English track failed, proceeding with only German track", e);
      }

      console.log("[Sprekio] deData =>", deData);
      console.log("[Sprekio] enData =>", enData);

      // JSON3 responses are objects, not arrays. Do not check .length on them!
      if (!deData || !deData.data) {
        throw new Error("Failed to fetch German track");
      }

      const formatJsonText = (segs: any[]) => segs?.map(s => s.utf8).join('').replace(/\n/g, ' ').trim() || "";

      // YouTube's JSON3 captions carry a real per-segment offset (tOffsetMs) within each
      // cue -- close to actual per-word timing for auto-generated captions. Use it when
      // available instead of guessing word timing from the cue's overall duration.
      const extractWordTimings = (e: any): { text: string, startMs: number }[] => {
        const timings: { text: string, startMs: number }[] = [];
        for (const seg of (e.segs || [])) {
          const segText = String(seg.utf8 || '').replace(/\n/g, ' ');
          const segStart = (e.tStartMs || 0) + (seg.tOffsetMs || 0);
          for (const w of segText.split(/\s+/).filter(Boolean)) {
            timings.push({ text: w, startMs: segStart });
          }
        }
        return timings;
      };

      const normalizeEvents = (res: any) => {
        if (!res || !res.data) return [];
        if (res.type === 'xml') {
          return res.data.map((item: any) => ({
            text: item.text,
            start: item.offset,
            duration: item.duration
          }));
        } else {
          return (res.data.events || []).map((e: any) => ({
            text: formatJsonText(e.segs),
            start: e.tStartMs || 0,
            duration: e.dDurationMs || 2000,
            wordTimings: extractWordTimings(e)
          }));
        }
      };

      const deEvents = normalizeEvents(deData);
      const enEvents = normalizeEvents(enData);

      console.log(`[Sprekio] deEvents: ${deEvents.length} total, first 3:`, deEvents.slice(0, 3));
      console.log(`[Sprekio] enEvents: ${enEvents.length} total, first 3:`, enEvents.slice(0, 3));
      
      const merged = deEvents.map((deEvent: any, idx: number) => {
        const tStart = deEvent.start;
        const dDur = deEvent.duration;
        const deText = deEvent.text;
        
        let enEvent = null;
        // YouTube's auto-translate (tlang=en) returns the exact same number of cues,
        // sharing the same timing as the German track, so pairing by index is normally safe.
        if (deEvents.length === enEvents.length && Math.abs(enEvents[idx].start - tStart) < 2000) {
          enEvent = enEvents[idx];
        } else {
          // Lengths differ (or the index-aligned cue's timing looks wrong, e.g. a native
          // English track that coincidentally has the same cue count) — find the cue
          // with the absolute closest start time instead.
          let minDiff = Infinity;
          for (const e of enEvents) {
            const diff = Math.abs(e.start - tStart);
            if (diff < minDiff) {
              minDiff = diff;
              enEvent = e;
            }
          }
          // Only accept if it's reasonably close (e.g., within 2 seconds)
          if (minDiff > 2000) enEvent = null;
        }

        const enText = enEvent ? enEvent.text : "";
        return {
          start: tStart / 1000,
          end: (tStart + dDur) / 1000,
          deText,
          enText,
          deWordTimings: deEvent.wordTimings as { text: string, startMs: number }[] | undefined
        };
      }).filter((t: any) => t.deText.length > 0);
      
      console.log(`[Sprekio] Merged ${merged.length} cues, first 3:`, merged.slice(0, 3));
      if (merged.length > 0) {
        setTranscript(merged);
        // Instantly prefetch the first 20 subtitles as soon as the transcript loads
        const initial = merged.slice(0, 20).map((t: any) => ({ text: t.deText }));
        VocabularyEngine.prefetch(initial);
      } else {
        throw new Error("Merged transcript is empty");
      }
    } catch (err) {
      console.error("Sprekio transcript fetch failed:", err);
      if (retryCount < 1) {
        setTimeout(() => { setIsFetchingTranscript(false); fetchTranscript(retryCount + 1); }, 3000);
        return;
      }
      // Retries exhausted — most likely this video simply has no captions on YouTube.
      setCaptionsUnavailable(true);
    }

    setIsFetchingTranscript(false);
  };

  useEffect(() => {
    const handleNavigation = () => {
      setTranscript([]);
      setLiveText("");
      setActiveTranscriptIndex(-1);
      currentLineIndexRef.current = -1;
      setActiveWordIndex(-1);
      activeWordIndexRef.current = -1;
      setIsFetchingTranscript(false);
      setCaptionsUnavailable(false);
      interceptedTranscripts.current = [];
      
      // Wait a moment for YouTube's SPA to load the new video's state
      setTimeout(() => {
        fetchTranscript(0);
      }, 1000);
    };
    window.addEventListener('yt-navigate-finish', handleNavigation);
    return () => window.removeEventListener('yt-navigate-finish', handleNavigation);
  }, []);

  useEffect(() => {
    if (isEnabled || showSidebar) {
      if (transcript.length === 0) fetchTranscript(0);
    }
  }, [showSidebar, isEnabled]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [user, setUser] = useState<{ uid: string, email: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedWordsSet, setSavedWordsSet] = useState<Set<string>>(new Set());
  const [controlsContainer, setControlsContainer] = useState<HTMLElement | null>(null);

  // Find YouTube Controls to inject Portal
  useEffect(() => {
    const interval = setInterval(() => {
      const rightControls = document.querySelector('.ytp-right-controls');
      if (rightControls && !document.getElementById('sprekio-controls-portal')) {
        const portalDiv = document.createElement('div');
        portalDiv.id = 'sprekio-controls-portal';
        portalDiv.style.display = 'inline-flex';
        portalDiv.style.alignItems = 'center';
        portalDiv.style.height = '100%';
        rightControls.prepend(portalDiv); // Puts it before CC button
        setControlsContainer(portalDiv);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Find YouTube's own secondary (right-hand) column to inject the transcript
  // sidebar into, so it sits beside the player in the page layout instead of
  // overlaying the video itself.
  const [sidebarContainer, setSidebarContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const interval = setInterval(() => {
      const secondary = document.querySelector('#secondary-inner') || document.querySelector('#secondary');
      if (secondary && !document.getElementById('sprekio-sidebar-portal')) {
        const portalDiv = document.createElement('div');
        portalDiv.id = 'sprekio-sidebar-portal';
        secondary.prepend(portalDiv); // Above the recommended-videos list
        setSidebarContainer(portalDiv);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync settings with chrome.storage.local
  useEffect(() => {
    try {
      chrome.storage.local.get(['sprekio_isEnabled', 'sprekio_autoPause', 'sprekio_subtitleStyle'], (result) => {
        if (result.sprekio_isEnabled !== undefined) setIsEnabled(result.sprekio_isEnabled as boolean);
        else setIsEnabled(true); // Default to true if never set

        if (result.sprekio_autoPause !== undefined) setAutoPause(result.sprekio_autoPause as boolean);
        if (result.sprekio_subtitleStyle === 'transparent' || result.sprekio_subtitleStyle === 'solid') {
          setSubtitleStyle(result.sprekio_subtitleStyle);
        }

        setHasLoadedSettings(true);
      });
    } catch (e) {
      console.error("Sprekio: Error reading storage (Context invalidated?). Please refresh the page.", e);
    }
  }, []);

  useEffect(() => {
    if (hasLoadedSettings) {
      try {
        chrome.storage.local.set({
          sprekio_isEnabled: isEnabled,
          sprekio_autoPause: autoPause,
          sprekio_provider: provider,
          sprekio_subtitleStyle: subtitleStyle
        });
      } catch (e) {
        console.error("Sprekio: Error saving storage. Please refresh the page.", e);
      }
    }
  }, [isEnabled, autoPause, provider, subtitleStyle, hasLoadedSettings]);

  // Check auth on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ action: "checkAuth" }, (res) => {
      if (res && res.loggedIn) {
        setUser(res.user);
        chrome.runtime.sendMessage({ action: "getWords" }, (wordRes) => {
          if (wordRes && wordRes.success) {
            const set = new Set<string>();
            wordRes.words.forEach((w: any) => set.add(w.word.toLowerCase()));
            setSavedWordsSet(set);
            setSavedWords(wordRes.words);
          }
        });
      }
    });
  }, []);

  const handleLogin = () => {
    chrome.runtime.sendMessage({ action: "login" }, (res) => {
      if (res && res.success) setUser(res.user);
      else alert("Login failed: " + (res?.error || "Unknown error"));
    });
  };

  const handleSaveWord = () => {
    if (!user) {
      handleLogin();
      return;
    }
    if (!hoveredWord || !wordDetails) return;
    
    setSaveStatus("saving");
    
    // Extract Video ID and Title
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v') || "";
    const videoTitle = document.title.replace(/^\(\d+\)\s+/, '').replace(' - YouTube', '').trim();

    chrome.runtime.sendMessage({
      action: "saveWord",
      word: hoveredWord.word,
      translationData: wordDetails,
      contextSentence: liveText,
      videoId,
      videoTitle
    }, (res) => {
      if (res && res.success) {
        setSaveStatus("saved");
        setSavedWordsSet(prev => new Set(prev).add(hoveredWord.word.toLowerCase()));
        // Refetch so the vocab tab has the real Firestore doc id (needed to delete it later)
        chrome.runtime.sendMessage({ action: "getWords" }, (wordRes) => {
          if (wordRes && wordRes.success) setSavedWords(wordRes.words);
        });
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        alert("Failed to save: " + (res?.error || "Unknown error"));
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
    });
  };

  // 1. Live DOM Scraping and Sidebar Sync
  useEffect(() => {
    // ALWAYS hide native CC when Sprekio is enabled to prevent overlap
    let style = document.getElementById('sprekio-cc-hider') as HTMLStyleElement;
    if (isEnabled) {
      if (!style) {
        style = document.createElement('style');
        style.id = 'sprekio-cc-hider';
        style.textContent = `.ytp-caption-window-container { opacity: 0.01 !important; pointer-events: none !important; }`;
        document.head.appendChild(style);
      }
    } else {
      if (style) style.remove();
    }
    
    // FALLBACK: DOM Scraper (Only used if the internal API fails to fetch transcript)
    // Auto-pause has no timestamp data to work with here, so it pauses whenever the
    // scraped caption text goes blank right after showing a line (end of a cue).
    let domLastCaptionText = "";
    let domAutoPausedAfter = "";
    const updateCaptionsFromDOM = () => {
      if (!isEnabled || transcript.length > 0) {
        return;
      }

      // Force native CC to turn on so we can scrape it (since it's visually hidden anyway)
      const ccButton = document.querySelector('.ytp-subtitles-button') as HTMLButtonElement;
      if (ccButton && ccButton.getAttribute('aria-pressed') === 'false') {
        ccButton.click();
      }

      const segments = Array.from(document.querySelectorAll('.ytp-caption-segment'));
      const text = segments.map(s => s.textContent).join(' ').replace(/\n/g, ' ').trim();
      setLiveText(text);

      if (autoPause) {
        if (text) {
          domLastCaptionText = text;
        } else if (domLastCaptionText && domAutoPausedAfter !== domLastCaptionText) {
          const video = document.querySelector('video');
          if (video && !video.paused) {
            video.pause();
            domAutoPausedAfter = domLastCaptionText;
          }
        }
      }
    };
    
    const observer = new MutationObserver(updateCaptionsFromDOM);
    const startObserving = () => {
      const container = document.getElementById('movie_player');
      if (container) {
        observer.observe(container, { childList: true, subtree: true, characterData: true });
      } else {
        setTimeout(startObserving, 1000);
      }
    };
    startObserving();

    // High-precision loop using requestAnimationFrame for syncing subtitles AND auto-pause
    let reqId: number;
    let lastKnownCurrentIndex = -1;

    const checkLoop = () => {
      if (!isEnabled) {
        reqId = requestAnimationFrame(checkLoop);
        return;
      }

      const video = document.querySelector('video');
      if (video) {
        const t = video.currentTime;

        // 1. Sync Subtitles
        if (transcript.length > 0) {
          let currentIndex = -1;
          for (let i = transcript.length - 1; i >= 0; i--) {
            if (t >= transcript[i].start && t <= transcript[i].end) {
              currentIndex = i;
              break;
            }
          }
          
          if (currentLineIndexRef.current !== currentIndex) {
            currentLineIndexRef.current = currentIndex;
            setActiveTranscriptIndex(currentIndex);
            if (currentIndex !== resumeGuardIndex.current) {
              resumeGuardIndex.current = -1;
            }
            
            if (currentIndex !== -1) {
              setLiveText(transcript[currentIndex].deText);
              
              // Phase 5D: Rolling Subtitle Prefetch
              // Prefetch the current subtitle and the next 15 upcoming subtitles 
              // so they are fully cached in the local DB before the user ever sees them.
              const upcoming = transcript.slice(currentIndex, currentIndex + 15).map(t => ({ text: t.deText }));
              VocabularyEngine.prefetch(upcoming);
            } else {
              setLiveText("");
            }
          }

          // Sidebar scrolling logic
          if (showSidebar && currentIndex !== -1 && currentIndex !== lastKnownCurrentIndex) {
            lastKnownCurrentIndex = currentIndex;
            const activeElem = document.getElementById(`transcript-line-${currentIndex}`);
            if (activeElem && transcriptRef.current) {
              activeElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }

          // Currently-spoken word, using real per-segment timing when the source track
          // provided it, otherwise a rough estimate based on the cue's overall duration.
          if (currentIndex !== -1) {
            const wordIdx = getActiveWordIndex(transcript[currentIndex], t);
            if (activeWordIndexRef.current !== wordIdx) {
              activeWordIndexRef.current = wordIdx;
              setActiveWordIndex(wordIdx);
            }
          } else if (activeWordIndexRef.current !== -1) {
            activeWordIndexRef.current = -1;
            setActiveWordIndex(-1);
          }
        }

        // 2. Auto-Pause Logic
        if (autoPause && transcript.length > 0 && !video.paused) {
          const prevT = prevTimeRef.current;
          
          // Detect seek
          if (Math.abs(t - prevT) > 1.0) {
            prevTimeRef.current = t;
            lastPausedIndex.current = -1;
          } else {
            let shouldPause = false;
            let newPausedIndex = -1;

            const activeIndex = currentLineIndexRef.current;
            if (activeIndex !== -1) {
              const line = transcript[activeIndex];
              if (t >= line.end - 0.15 && t < line.end + 0.2 &&
                  lastPausedIndex.current !== activeIndex &&
                  resumeGuardIndex.current !== activeIndex) {
                shouldPause = true;
                newPausedIndex = activeIndex;
              }
            }
            
            if (shouldPause) {
              video.pause();
              lastPausedIndex.current = newPausedIndex;
            }
            prevTimeRef.current = t;
          }
        } else if (autoPause && video.paused) {
          // Keep synced while paused so unpausing doesn't trigger seek logic
          prevTimeRef.current = t;
        }
      }
      reqId = requestAnimationFrame(checkLoop);
    };
    
    reqId = requestAnimationFrame(checkLoop);

    // Language Reactor style keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && autoPause) {
        const video = document.querySelector('video');
        if (video) {
          e.preventDefault();
          e.stopPropagation();
          if (video.paused) video.play();
          else video.pause();
        }
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'a') {
        const video = document.querySelector('video');
        if (video) video.currentTime = Math.max(0, video.currentTime - 5);
      } else if (key === 'd') {
        const video = document.querySelector('video');
        if (video) video.currentTime += 5;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const handleVideoPlay = () => {
      if (!autoPause || transcript.length === 0) return;
      const video = document.querySelector('video');
      if (!video) return;
      let currentIndex = transcript.findIndex(line =>
        video.currentTime >= line.start && video.currentTime <= line.end + 0.5
      );
      if (currentIndex === -1) {
        currentIndex = transcript.reduce((nearestIndex, line, index) =>
          line.end <= video.currentTime &&
          video.currentTime - line.end < video.currentTime - transcript[nearestIndex].end
            ? index
            : nearestIndex,
          0
        );
      }
      resumeGuardIndex.current = currentIndex;
      lastPausedIndex.current = -1;
      prevTimeRef.current = video.currentTime;
    };

    const video = document.querySelector('video');
    video?.addEventListener('play', handleVideoPlay);

    let suppressClickUntil = 0;
    const isPlayerSurface = (event: Event) => {
      const target = event.target as Element | null;
      const player = target
        ? Array.from(document.querySelectorAll('.html5-video-player')).find(candidate => candidate.contains(target))
        : null;
      const currentVideo = player?.querySelector('video');
      if (!currentVideo || target?.closest('.ytp-chrome-controls, .ytp-panel, #sprekio-controls-portal, .sprekio-subtitle-interactive')) return null;
      return { currentVideo, target };
    };
    const handlePlayerPointerDown = (event: Event) => {
      const playerSurface = isPlayerSurface(event);
      if (!playerSurface || !playerSurface.currentVideo.paused) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = performance.now() + 500;
      void playerSurface.currentVideo.play().catch(() => undefined);
    };
    const handlePlayerClick = (event: Event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener('pointerdown', handlePlayerPointerDown, true);
    document.addEventListener('click', handlePlayerClick, true);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(reqId);
      window.removeEventListener('keydown', handleKeyDown);
      video?.removeEventListener('play', handleVideoPlay);
      document.removeEventListener('pointerdown', handlePlayerPointerDown, true);
      document.removeEventListener('click', handlePlayerClick, true);
    };
  }, [isEnabled, autoPause, showSidebar, transcript]);

  // Translate full sentence when liveText changes
  useEffect(() => {
    liveTextRef.current = liveText;

    if (sentenceTranslateTimeout.current) {
      clearTimeout(sentenceTranslateTimeout.current);
      sentenceTranslateTimeout.current = null;
    }

    if (!isEnabled || !liveText.trim()) {
      setTranslatedText("");
      setIsTranslating(false);
      return;
    }

    // Use YouTube's own English subtitle track (enText) — instant, free, no AI needed.
    if (transcript.length > 0) {
      const strip = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const strippedLive = strip(liveText);
      
      // 1. Try to find the exact line by text match to perfectly sync with the DOM
      // We search near the active index first for performance and to handle duplicate lines
      const startIndex = Math.max(0, activeTranscriptIndex - 5);
      const MathMin = Math.min(transcript.length, activeTranscriptIndex + 5);
      
      let matchedCue = transcript.find((t, i) => i >= startIndex && i <= MathMin && strip(t.deText) === strippedLive);
      
      if (!matchedCue) {
        // Fallback to searching the whole array if not found nearby
        matchedCue = transcript.find(t => strip(t.deText) === strippedLive);
      }
      
      if (matchedCue && matchedCue.enText) {
        setTranslatedText(matchedCue.enText);
        setIsTranslating(false);
        return;
      }
      
      // 2. Fallback to time-based index if text matching fails (e.g. DOM formatting weirdness)
      if (activeTranscriptIndex >= 0) {
        const cue = transcript[activeTranscriptIndex];
        if (cue && cue.enText) {
          setTranslatedText(cue.enText);
          setIsTranslating(false);
          return;
        }
      }
    }

    // No official English subtitle track available (e.g. transcript fetch failed and
    // we're relying on the DOM-scraper fallback) — fall back to AI sentence translation.
    const cached = sentenceTranslationCache.current[liveText];
    if (cached) {
      setTranslatedText(cached);
      setIsTranslating(false);
      return;
    }

    setIsTranslating(true);
    const textToTranslate = liveText;

    const sendTranslateRequest = (retryCount: number) => {
      try {
        chrome.runtime.sendMessage(
          { action: "translateSentence", text: textToTranslate, provider },
          (response) => {
            // MV3 service workers can be asleep, dropping the message. Retry once after 400ms.
            if (chrome.runtime.lastError || !response) {
              if (liveTextRef.current !== textToTranslate) return; // subtitle already advanced
              if (retryCount < 1) {
                setTimeout(() => sendTranslateRequest(retryCount + 1), 400);
              } else {
                setIsTranslating(false);
              }
              return;
            }
            if (liveTextRef.current !== textToTranslate) return; // stale response, subtitle already advanced
            const translation = response.translation || "";
            sentenceTranslationCache.current[textToTranslate] = translation;
            setTranslatedText(translation);
            setIsTranslating(false);
          }
        );
      } catch (e) {
        // Extension context invalidated after reload — stop showing the loading state.
        setIsTranslating(false);
      }
    };

    sentenceTranslateTimeout.current = window.setTimeout(() => sendTranslateRequest(0), 400);
  }, [liveText, isEnabled, activeTranscriptIndex, transcript]);

  // 2. Hover Handlers
  const handleWordEnter = async (word: string, e: React.MouseEvent) => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    
    const video = document.querySelector('video');
    if (video && !video.paused) {
      video.pause();
    }

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setHoveredWord({ word, rect });
    
    const cacheKey = `${word.toLowerCase()}_${liveText}`;
    if (wordCache.current[cacheKey]) {
      setWordDetails(wordCache.current[cacheKey]);
      setLoading(false);
      return;
    }

    setWordDetails(null);
    setLoading(true);

    const details = await VocabularyEngine.lookup(word, liveText, provider, (intermediateResult) => {
       // If we are still hovering this exact word, render the intermediate result immediately
       setHoveredWord((current) => {
          if (current && current.word === word) {
             setWordDetails(intermediateResult);
             setLoading(false);
          }
          return current;
       });
    });

    // Only cache successful results — never cache errors, D1 failures, or "Network error" 
    // so the next hover will retry the backend rather than repeatedly show a stale error.
    const isError = !details || !details.translations || details.translations.length === 0 ||
      (details.translations[0] as any).text === "Network error" ||
      String((details.translations[0] as any).text).startsWith("D1_ERROR") ||
      String((details.translations[0] as any).text).startsWith("API Error");
    
    if (!isError) {
      wordCache.current[cacheKey] = details;
    }
    
    // Check if the user is still hovering over the exact same word before updating state
    setHoveredWord((current) => {
      if (current && current.word === word) {
        setWordDetails(details);
        setLoading(false);
      }
      return current;
    });
  };

  const handleWordLeave = () => {
    hideTimeout.current = window.setTimeout(() => {
      setHoveredWord(null);
      setWordDetails(null);
    }, 200);
  };

  // 3. UI Render
  const visibleLines = activeTranscriptIndex >= 0 && transcript.length > 0
    ? transcript.slice(activeTranscriptIndex, activeTranscriptIndex + 1)
    : liveText
      ? [{ deText: liveText }]
      : [];

  const currentVideoId = new URLSearchParams(window.location.search).get('v') || "";
  const videoWords = savedWords.filter(w => w.videoId === currentVideoId);

  const shuffle = <T,>(arr: T[]): T[] => {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // We only have per-cue (line-level) timestamps, not real per-word ASR timing, so the
  // "currently spoken" word is an estimate: split the line into words and advance through
  // them proportionally to elapsed time, weighted by each word's character length.
  const estimateActiveWordIndex = (text: string, progress: number): number => {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return -1;
    const totalChars = words.reduce((sum, w) => sum + w.length, 0) || 1;
    const target = progress * totalChars;
    let cumulative = 0;
    for (let i = 0; i < words.length; i++) {
      cumulative += words[i].length;
      if (target <= cumulative) return i;
    }
    return words.length - 1;
  };

  // Prefer YouTube's real per-segment offsets (close to true word timing for
  // auto-generated captions) when available; fall back to the character-length
  // estimate for lines that only have a whole-cue duration (e.g. XML source, or
  // a native, human-authored track with no per-segment breakdown).
  const getActiveWordIndex = (line: { deText: string, start: number, end: number, deWordTimings?: { text: string, startMs: number }[] }, tSeconds: number): number => {
    if (line.deWordTimings && line.deWordTimings.length > 0) {
      const tMs = tSeconds * 1000;
      let idx = -1;
      for (let i = 0; i < line.deWordTimings.length; i++) {
        if (line.deWordTimings[i].startMs <= tMs) idx = i;
        else break;
      }
      return idx === -1 ? 0 : idx;
    }
    const progress = Math.min(1, Math.max(0, (tSeconds - line.start) / ((line.end - line.start) || 1)));
    return estimateActiveWordIndex(line.deText, progress);
  };

  const startQuiz = () => {
    const shuffledWords = shuffle(videoWords);
    const questions = shuffledWords.map(word => {
      const correct = word.translation || word.lemma || word.word;
      const distractorPool = videoWords
        .filter(w => w.id !== word.id)
        .map(w => w.translation || w.lemma)
        .filter((t): t is string => !!t && t !== correct);
      const distractors = shuffle(distractorPool).slice(0, 3);
      return { word, choices: shuffle([correct, ...distractors]) };
    });
    setQuizOrder(questions);
    setQuizIndex(0);
    setQuizScore(0);
    setQuizSelected(null);
  };

  const currentQuizQuestion = quizOrder[quizIndex] || null;

  const renderTokens = (text: string) => {
    let wordCounter = -1;
    return text.split(/(\s+|[.,!?;:"'”„“()[\]])/).map((token, i) => {
      if (!token.trim() || /^[.,!?;:"'”„“()[\]]+$/.test(token)) {
        return <span key={i}>{token}</span>;
      }
      wordCounter++;
      const isSaved = savedWordsSet.has(token.toLowerCase());
      const isSpeaking = wordCounter === activeWordIndex;
      const idleBg = isSpeaking ? '#f97316' : (isSaved ? 'rgba(249,115,22,0.22)' : 'transparent');
      const idleColor = isSpeaking ? '#ffffff' : 'inherit';
      return (
        <span
          key={i}
          className="sprekio-subtitle-interactive"
          onMouseEnter={(e) => handleWordEnter(token, e)}
          onMouseLeave={handleWordLeave}
          style={{
            cursor: 'pointer', padding: '0 2px', borderRadius: '4px',
            transition: 'background-color 0.2s, color 0.2s',
            pointerEvents: 'auto', color: idleColor, backgroundColor: idleBg
          }}
          onMouseOver={(e) => { (e.target as HTMLElement).style.backgroundColor = '#f97316'; (e.target as HTMLElement).style.color = '#ffffff'; }}
          onMouseOut={(e) => { (e.target as HTMLElement).style.backgroundColor = idleBg; (e.target as HTMLElement).style.color = idleColor; }}
        >
          {token}
        </span>
      );
    });
  };

  const tooltipHalfWidth = Math.min(260, (window.innerWidth - 20) / 2);
  const tooltipCenter = hoveredWord
    ? hoveredWord.rect.left + hoveredWord.rect.width / 2
    : window.innerWidth / 2;
  const tooltipLeft = Math.min(
    Math.max(tooltipCenter, tooltipHalfWidth + 10),
    window.innerWidth - tooltipHalfWidth - 10
  );

  return (
    <>
      {isEnabled && (
        !liveText ? (
          <div style={{
            position: 'absolute', top: '80px', left: '20px', backgroundColor: 'rgba(20,83,45,0.9)',
            color: 'white', padding: '10px 16px', borderRadius: '8px', zIndex: 9999,
            border: '1px solid rgba(255,255,255,0.2)', fontSize: '14px', opacity: 0.5
          }}>
            {captionsUnavailable
              ? '🇩🇪 Sprekio: No captions available for this video.'
              : '🇩🇪 Sprekio: Connected to video. (Waiting for speech...)'}
          </div>
        ) : (() => {
          const isGlassSub = subtitleStyle === 'transparent';
          const targetStyle: React.CSSProperties = isGlassSub
            ? { background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)', border: '1px solid rgba(255,255,255,0.4)', color: '#ffffff', textShadow: '0 1px 6px rgba(0,0,0,0.45)' }
            : { background: '#ffffff', color: '#17120e' };
          const translationStyle: React.CSSProperties = isGlassSub
            ? { background: 'rgba(249,115,22,0.32)', backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)', border: '1px solid rgba(249,115,22,0.6)', color: '#ffffff', textShadow: '0 1px 6px rgba(0,0,0,0.45)' }
            : { background: '#f97316', color: '#ffffff' };
          return (
            <div style={{
              position: 'absolute', bottom: '10%', left: '0', right: '0',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 9999,
              pointerEvents: 'none', padding: '0 10px'
            }}>
              <div className="sprekio-subtitle-box" style={{
                ...targetStyle,
                padding: '8px 16px', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                textAlign: 'center', pointerEvents: 'none',
                width: 'max-content', maxWidth: 'calc(100% - 20px)', margin: '0 10px', boxSizing: 'border-box',
                display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                transition: 'background-color 0.2s, border-color 0.2s'
              }}>
                <h2 className="sprekio-subtitle-text" style={{
                  fontSize: '22px', fontWeight: '700', color: 'inherit',
                  lineHeight: '1.3', margin: 0
                }}>
                  {visibleLines.map((line, lineIndex) => (
                    <React.Fragment key={`${line.deText}-${lineIndex}`}>
                      {lineIndex > 0 && ' '}
                      {renderTokens(line.deText)}
                    </React.Fragment>
                  ))}
                </h2>
              </div>
              {(translatedText || isTranslating) && (
                <div style={{
                  ...translationStyle,
                  padding: '6px 16px', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                  pointerEvents: 'none', width: 'max-content', maxWidth: 'calc(100% - 20px)',
                  margin: '0 10px', boxSizing: 'border-box', transition: 'background-color 0.2s, border-color 0.2s'
                }}>
                  <p className="sprekio-subtitle-translation" style={{
                    fontSize: '18px', fontWeight: '600', margin: 0, color: 'inherit',
                    opacity: isTranslating ? 0.5 : 1, transition: 'opacity 0.3s ease-in-out'
                  }}>
                    {isTranslating && !translatedText ? '...' : translatedText}
                  </p>
                </div>
              )}
            </div>
          );
        })()
      )}

      {/* Hover Tooltip */}
      {isEnabled && hoveredWord && createPortal(
        <div
          className="sprekio-scroll-hidden"
          style={{
            position: 'fixed', zIndex: 2147483647, backgroundColor: '#ffffff', color: '#111827',
            borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb',
            padding: '20px', width: 'min(520px, calc(100vw - 20px))', maxWidth: 'calc(100vw - 20px)',
            maxHeight: 'calc(100vh - 20px)', overflowY: 'auto', overflowX: 'hidden',
            boxSizing: 'border-box', pointerEvents: 'auto',
            bottom: window.innerHeight - hoveredWord.rect.top + 15,
            left: tooltipLeft,
            transform: 'translateX(-50%)'
          }}
          onMouseEnter={() => { if (hideTimeout.current) clearTimeout(hideTimeout.current); }}
          onMouseLeave={handleWordLeave}
        >
          {/* Invisible bridge to prevent hover loss when moving mouse from word to tooltip */}
          <div style={{ position: 'absolute', bottom: '-25px', left: '-10%', width: '120%', height: '30px', backgroundColor: 'transparent' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', minWidth: 0 }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{hoveredWord.word}</div>
            <button 
              onClick={() => {
                if ('speechSynthesis' in window) {
                  const utterance = new SpeechSynthesisUtterance(hoveredWord.word);
                  utterance.lang = 'de-DE';
                  window.speechSynthesis.speak(utterance);
                }
              }}
              title="Listen to pronunciation"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background-color 0.2s', outline: 'none'
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              🔊
            </button>
          </div>
          
          {loading ? (
            <div style={{ fontSize: '14px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⏳ Translating...
            </div>
          ) : wordDetails ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                {wordDetails.translations?.map((t: any, idx: number) => (
                  <div key={idx} style={{ fontSize: idx === 0 ? '18px' : '15px', fontWeight: idx === 0 ? '600' : '500', color: idx === 0 ? '#ea580c' : '#4b5563', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {t.text}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', alignItems: 'center', minWidth: 0 }}>
                {wordDetails.partOfSpeech && (
                  <span style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: '99px', fontWeight: '600' }}>
                    {wordDetails.partOfSpeech}
                  </span>
                )}
                {wordDetails.gender && (
                  <span style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: '99px', fontWeight: '600' }}>
                    {wordDetails.gender}
                  </span>
                )}
                {wordDetails.case && (
                  <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '99px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                    {wordDetails.case}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, overflowWrap: 'anywhere' }}>
                   {wordDetails.source === 'ai' ? '🤖 AI' : '📖 Dict'} {wordDetails.cached && '⚡'}
                   {wordDetails.confidence !== undefined && (
                     wordDetails.confidence >= 0.9 ? ' (High Confidence)' :
                     wordDetails.confidence >= 0.7 ? ' (Likely)' : ' (Contextual Meaning)'
                   )}
                </span>
              </div>
              
              {wordDetails.lemma && wordDetails.lemma !== hoveredWord.word && (
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                  Lemma: <span style={{ fontWeight: '500', color: '#4b5563' }}>{wordDetails.lemma}</span>
                </div>
              )}

              {/* Phase 6C: "Why this meaning?" mechanism */}
              {wordDetails.translations?.[0]?.evidence?.length > 0 && (
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', fontStyle: 'italic', backgroundColor: '#f9fafb', padding: '6px', borderRadius: '4px', textAlign: 'left', overflowWrap: 'anywhere' }}>
                  💡 {wordDetails.translations[0].evidence[0].reason}
                </div>
              )}
              {wordDetails.translations?.[0]?.aiReason && (
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', fontStyle: 'italic', backgroundColor: '#f9fafb', padding: '6px', borderRadius: '4px', textAlign: 'left', overflowWrap: 'anywhere' }}>
                  💡 {wordDetails.translations[0].aiReason}
                </div>
              )}

              {(() => {
                const isAlreadySaved = savedWordsSet.has(hoveredWord.word.toLowerCase());
                const buttonDisabled = saveStatus === "saving" || saveStatus === "saved" || isAlreadySaved;
                let buttonBg = '#f97316';
                if (saveStatus === "saved" || isAlreadySaved) buttonBg = '#10b981';
                else if (saveStatus === "error") buttonBg = '#ef4444';

                return (
                  <button 
                    onClick={handleSaveWord}
                    disabled={buttonDisabled}
                    style={{
                      width: '100%', marginTop: '12px', color: 'white',
                      backgroundColor: buttonBg,
                      fontSize: '14px', fontWeight: '600', padding: '8px 0', borderRadius: '8px',
                      border: 'none', cursor: buttonDisabled ? 'default' : 'pointer',
                      transition: 'background-color 0.2s',
                      opacity: buttonDisabled ? 0.9 : 1
                    }}
                    onMouseOver={(e) => { if (!buttonDisabled) (e.target as HTMLElement).style.backgroundColor = '#c2410c'; }}
                    onMouseOut={(e) => { if (!buttonDisabled) (e.target as HTMLElement).style.backgroundColor = '#f97316'; }}
                  >
                    {!user ? "Login to Save" : 
                     isAlreadySaved ? "✓ Saved in Vocab" : 
                     saveStatus === "saving" ? "Saving..." : 
                     saveStatus === "saved" ? "✓ Saved!" : "Save to Vocab"}
                  </button>
                );
              })()}
            </div>
          ) : null}
        </div>,
        document.body
      )}

      {/* Floating Controls inside YouTube Player Bar */}
      {controlsContainer && createPortal(
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '0 8px' }}>
          <button
            onClick={() => setIsEnabled(!isEnabled)}
            title="Toggle Sprekio (Language Lab)"
            style={{
              backgroundColor: isEnabled ? '#2563eb' : 'transparent',
              color: isEnabled ? 'white' : '#eee',
              border: '1px solid',
              borderColor: isEnabled ? '#2563eb' : '#eee',
              borderRadius: '4px',
              padding: '4px 8px',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              opacity: 0.9
            }}
            onMouseOver={(e) => (e.target as HTMLElement).style.opacity = '1'}
            onMouseOut={(e) => (e.target as HTMLElement).style.opacity = '0.9'}
          >
            🇩🇪 {isEnabled ? 'ON' : 'OFF'}
          </button>

          {isEnabled && (
            <button
              onClick={() => setAutoPause(!autoPause)}
              title="Auto-Pause after every sentence"
              style={{
                backgroundColor: autoPause ? '#10b981' : 'transparent',
                color: autoPause ? 'white' : '#eee',
                border: '1px solid',
                borderColor: autoPause ? '#10b981' : '#eee',
                borderRadius: '4px',
                padding: '4px 8px',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                opacity: 0.9
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.opacity = '1'}
              onMouseOut={(e) => (e.target as HTMLElement).style.opacity = '0.9'}
            >
              {autoPause ? 'AP ON' : 'AP OFF'}
            </button>
          )}

            {isEnabled && (
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                title="Toggle Transcript Sidebar"
                style={{
                  backgroundColor: showSidebar ? '#10b981' : 'transparent',
                  color: showSidebar ? 'white' : '#eee',
                  border: '1px solid',
                  borderColor: showSidebar ? '#10b981' : '#eee',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  opacity: 0.9
                }}
                onMouseOver={(e) => (e.target as HTMLElement).style.opacity = '1'}
                onMouseOut={(e) => (e.target as HTMLElement).style.opacity = '0.9'}
              >
                📝 Sidebar
              </button>
            )}

            {isEnabled && (
              <button
                onClick={() => setSubtitleStyle(subtitleStyle === 'solid' ? 'transparent' : 'solid')}
                title="Subtitle style: solid boxes or glass on the video"
                style={{
                  backgroundColor: 'transparent',
                  color: '#eee',
                  border: '1px solid #eee',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  opacity: 0.9
                }}
                onMouseOver={(e) => (e.target as HTMLElement).style.opacity = '1'}
                onMouseOut={(e) => (e.target as HTMLElement).style.opacity = '0.9'}
              >
                {subtitleStyle === 'solid' ? '◻ Solid' : '◫ Glass'}
              </button>
            )}
        </div>,
        controlsContainer
        )}
        
        {isEnabled && showSidebar && sidebarContainer && (() => {
          const isGlass = subtitleStyle === 'transparent';
          const panelBg = isGlass ? 'rgba(255,255,255,0.7)' : '#fffaf5';
          const panelBorder = isGlass ? '1px solid rgba(255,255,255,0.85)' : '1px solid #f0e6da';
          const panelBackdrop = isGlass ? 'blur(20px) saturate(160%)' : undefined;

          const tabButton = (tab: typeof sidebarTab, label: string) => (
            <button
              onClick={() => setSidebarTab(tab)}
              style={{
                flex: 1, padding: '8px 6px', fontSize: '12px', fontWeight: 700,
                border: 'none', borderRadius: '8px', cursor: 'pointer',
                backgroundColor: sidebarTab === tab ? '#f97316' : 'transparent',
                color: sidebarTab === tab ? '#ffffff' : '#8a7a6d',
                transition: 'background-color 0.15s, color 0.15s'
              }}
            >
              {label}
            </button>
          );

          return createPortal(
            <div style={{
              backgroundColor: panelBg, border: panelBorder,
              backdropFilter: panelBackdrop, WebkitBackdropFilter: panelBackdrop,
              borderRadius: '14px', marginBottom: '16px', boxShadow: '0 2px 16px rgba(60,40,20,0.08)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              maxHeight: 'min(70vh, 640px)', color: '#292018', fontFamily: 'Roboto, Arial, sans-serif'
            }}>
              <div style={{ padding: '12px 14px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#57493f' }}>Sprekio</h3>
                <button onClick={() => setShowSidebar(false)} style={{ background: 'none', border: 'none', color: '#a89686', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
              </div>

              <div style={{ display: 'flex', gap: '4px', padding: '0 10px 10px' }}>
                {tabButton('transcript', 'Transcript')}
                {tabButton('vocab', `My Vocab${videoWords.length ? ` (${videoWords.length})` : ''}`)}
                {tabButton('quiz', 'Quiz')}
              </div>

              {sidebarTab === 'transcript' && (
                <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 12px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  {isFetchingTranscript && transcript.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#a89686', marginTop: '20px', fontSize: '13px' }}>Loading transcript...</div>
                  ) : transcript.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#a89686', marginTop: '20px', fontSize: '13px' }}>No captions available for this video.</div>
                  ) : (
                    transcript.map((line, i) => {
                      const isActive = i === activeTranscriptIndex;
                      return (
                        <div
                          key={i}
                          id={`transcript-line-${i}`}
                          onClick={() => {
                            const video = document.querySelector('video');
                            if (video) video.currentTime = line.start;
                          }}
                          style={{
                            padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
                            borderLeft: isActive ? '3px solid #f97316' : '3px solid transparent',
                            backgroundColor: isActive ? 'rgba(249,115,22,0.1)' : 'transparent',
                            transition: 'background-color 0.15s'
                          }}
                          onMouseOver={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.035)'; }}
                          onMouseOut={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <div style={{ fontSize: '13px', fontWeight: isActive ? 700 : 500, color: isActive ? '#c2410c' : '#4a3f38', marginBottom: '2px', lineHeight: 1.4 }}>
                            {line.deText}
                          </div>
                          {line.enText && (
                            <div style={{ fontSize: '12px', color: '#a89686', lineHeight: 1.4 }}>
                              {line.enText}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {sidebarTab === 'vocab' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {!user ? (
                    <div style={{ textAlign: 'center', color: '#a89686', marginTop: '20px', fontSize: '13px' }}>Log in to save and see words from this video.</div>
                  ) : videoWords.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#a89686', marginTop: '20px', fontSize: '13px' }}>No words saved from this video yet.<br />Hover a word in the subtitles and hit Save.</div>
                  ) : (
                    videoWords.map((w) => (
                      <div key={w.id} style={{
                        padding: '10px 12px', borderRadius: '10px',
                        backgroundColor: isGlass ? 'rgba(255,255,255,0.55)' : '#ffffff',
                        border: '1px solid ' + (isGlass ? 'rgba(255,255,255,0.7)' : '#f0e6da'),
                        display: 'flex', flexDirection: 'column', gap: '4px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#292018' }}>{w.word}</div>
                          <button
                            onClick={() => {
                              chrome.runtime.sendMessage({ action: "deleteWord", id: w.id }, (res) => {
                                if (res && res.success) setSavedWords(prev => prev.filter(x => x.id !== w.id));
                              });
                            }}
                            title="Remove from vocab"
                            style={{ background: 'none', border: 'none', color: '#c9b8a8', cursor: 'pointer', fontSize: '13px', lineHeight: 1, padding: '2px' }}
                          >
                            ✕
                          </button>
                        </div>
                        {w.translation && <div style={{ fontSize: '13px', color: '#6b5d54' }}>{w.translation}</div>}
                        {(w.partOfSpeech || w.gender) && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {w.partOfSpeech && <span style={{ fontSize: '11px', fontWeight: 600, color: '#c2410c', backgroundColor: '#fff1e4', padding: '1px 7px', borderRadius: '99px' }}>{w.partOfSpeech}</span>}
                            {w.gender && <span style={{ fontSize: '11px', fontWeight: 600, color: '#c2410c', backgroundColor: '#fff1e4', padding: '1px 7px', borderRadius: '99px' }}>{w.gender}</span>}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {sidebarTab === 'quiz' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {videoWords.length < 4 ? (
                    <div style={{ textAlign: 'center', color: '#a89686', marginTop: '20px', fontSize: '13px' }}>
                      Save at least 4 words from this video to unlock a quiz.<br />
                      You have {videoWords.length} so far.
                    </div>
                  ) : quizOrder.length === 0 ? (
                    <div style={{ textAlign: 'center', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                      <div style={{ fontSize: '13px', color: '#6b5d54' }}>{videoWords.length} words saved from this video.</div>
                      <button onClick={startQuiz} style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                        Start Quiz
                      </button>
                    </div>
                  ) : quizIndex >= quizOrder.length ? (
                    <div style={{ textAlign: 'center', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700 }}>Score: {quizScore} / {quizOrder.length}</div>
                      <button onClick={startQuiz} style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                        Retake Quiz
                      </button>
                    </div>
                  ) : currentQuizQuestion && (
                    <>
                      <div style={{ fontSize: '12px', color: '#a89686', fontWeight: 600 }}>
                        Question {quizIndex + 1} of {quizOrder.length}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center' }}>
                        {currentQuizQuestion.word.word}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {currentQuizQuestion.choices.map((choice: string, idx: number) => {
                          const correctChoice = currentQuizQuestion.word.translation || currentQuizQuestion.word.lemma || currentQuizQuestion.word.word;
                          const isCorrect = choice === correctChoice;
                          const isPicked = quizSelected === idx;
                          let bg = isGlass ? 'rgba(255,255,255,0.55)' : '#ffffff';
                          let border = isGlass ? '1px solid rgba(255,255,255,0.7)' : '1px solid #f0e6da';
                          let color = '#292018';
                          if (quizSelected !== null) {
                            if (isCorrect) { bg = '#eafaf0'; border = '1px solid #86d9a8'; color = '#1a7a44'; }
                            else if (isPicked) { bg = '#fdeeee'; border = '1px solid #eeadaa'; color = '#b3372f'; }
                          }
                          return (
                            <button
                              key={idx}
                              disabled={quizSelected !== null}
                              onClick={() => {
                                setQuizSelected(idx);
                                if (isCorrect) setQuizScore(s => s + 1);
                              }}
                              style={{
                                textAlign: 'left', padding: '10px 12px', borderRadius: '9px',
                                backgroundColor: bg, border, color,
                                fontSize: '13px', fontWeight: 600, cursor: quizSelected === null ? 'pointer' : 'default',
                                transition: 'background-color 0.15s, border-color 0.15s'
                              }}
                            >
                              {choice}
                            </button>
                          );
                        })}
                      </div>
                      {quizSelected !== null && (
                        <button
                          onClick={() => { setQuizIndex(i => i + 1); setQuizSelected(null); }}
                          style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', alignSelf: 'center' }}
                        >
                          {quizIndex + 1 === quizOrder.length ? 'See Score' : 'Next'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>,
            sidebarContainer
          );
        })()}
      </>
  );
};

  let currentRoot: any = null;

  const ensureApp = () => {
    const videoContainer = document.querySelector('.html5-video-player') || document.getElementById('movie_player');
    if (!videoContainer) return; // Player not loaded yet
    
    // Check if YouTube completely deleted our root during an SPA navigation
    const existingContainer = document.getElementById('sprekio-extension-root');
    if (existingContainer && videoContainer.contains(existingContainer)) {
      return; // All good, it's already there
    }

    // If it exists but is orphaned (not in the videoContainer anymore), clean it up
    if (existingContainer) {
      if (currentRoot) currentRoot.unmount();
      existingContainer.remove();
    }

    // Create and inject the root
    const appContainer = document.createElement('div');
    appContainer.id = 'sprekio-extension-root';
    appContainer.className = 'sprekio-tw';
    videoContainer.appendChild(appContainer);
    
    currentRoot = createRoot(appContainer);
    currentRoot.render(<SprekioOverlay />);
  };

  // Run immediately, and then keep checking every second to survive YouTube SPA navigations
  ensureApp();
  setInterval(ensureApp, 1000);


