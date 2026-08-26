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
  const [transcript, setTranscript] = useState<{start: number, end: number, deText: string, enText: string}[]>([]);
  const [activeTranscriptIndex, setActiveTranscriptIndex] = useState(-1);
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false);
  const [captionsUnavailable, setCaptionsUnavailable] = useState(false);
  
  const [liveText, setLiveText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [hoveredWord, setHoveredWord] = useState<{ word: string, rect: DOMRect } | null>(null);
  const [wordDetails, setWordDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hideTimeout = useRef<number | null>(null);
  const wordCache = useRef<Record<string, any>>({});
  const lastPausedIndex = useRef(-1);
  const resumeGuardIndex = useRef(-1);
  const prevTimeRef = useRef(0);
  const currentLineIndexRef = useRef(-1);

  const interceptedTranscripts = useRef<{url: string, text: string, status: number, headers: any[]}[]>([]);
  const sentenceTranslationCache = useRef<Record<string, string>>({});
  const sentenceTranslateTimeout = useRef<number | null>(null);

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
                  return forceJson ? JSON.parse(intercepted.text) : parseTranscriptXml(intercepted.text);
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
              return forceJsonParse ? JSON.parse(text) : parseTranscriptXml(text);
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
               return forceJsonParse ? JSON.parse(mainRes.text) : parseTranscriptXml(mainRes.text);
            }
          } catch(e) {
            console.error(`[Sprekio] Main World Fetch Exception:`, e);
          }

          const res = await new Promise<any>((resolve) => {
            chrome.runtime.sendMessage({ action: "fetchSubtitles", url: fetchUrl }, resolve);
          });
          console.log(`[Sprekio] Background Service Fetch - Response:`, res);
          if (res && res.error) throw new Error(res.error);
          return forceJsonParse ? JSON.parse(res.text) : parseTranscriptXml(res.text || "");
        };

        try {
          // Try JSON3 first
          return { data: await tryFetch(baseUrl + "&fmt=json3", true), type: 'json' };
        } catch (e) {
          console.warn("JSON3 fetch failed, trying XML...", e);
          try {
            // Try standard XML
            return { data: await tryFetch(baseUrl, false), type: 'xml' };
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
            duration: e.dDurationMs || 2000
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
          enText
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

  // Sync settings with chrome.storage.local
  useEffect(() => {
    try {
      chrome.storage.local.get(['sprekio_isEnabled', 'sprekio_autoPause'], (result) => {
        if (result.sprekio_isEnabled !== undefined) setIsEnabled(result.sprekio_isEnabled as boolean);
        else setIsEnabled(true); // Default to true if never set
        
        if (result.sprekio_autoPause !== undefined) setAutoPause(result.sprekio_autoPause as boolean);
        
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
          sprekio_provider: provider
        });
      } catch (e) {
        console.error("Sprekio: Error saving storage. Please refresh the page.", e);
      }
    }
  }, [isEnabled, autoPause, provider, hasLoadedSettings]);

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
    sentenceTranslateTimeout.current = window.setTimeout(() => {
      chrome.runtime.sendMessage(
        { action: "translateSentence", text: textToTranslate, provider },
        (response) => {
          void chrome.runtime.lastError;
          if (liveText !== textToTranslate) return; // stale response, subtitle already advanced
          const translation = response?.translation || "";
          sentenceTranslationCache.current[textToTranslate] = translation;
          setTranslatedText(translation);
          setIsTranslating(false);
        }
      );
    }, 400);
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

  const renderTokens = (text: string) => text.split(/(\s+|[.,!?;:"'”„“()[\]])/).map((token, i) => {
    if (!token.trim() || /^[.,!?;:"'”„“()[\]]+$/.test(token)) {
      return <span key={i}>{token}</span>;
    }
    return (
      <span 
        key={i}
        className="sprekio-subtitle-interactive"
        onMouseEnter={(e) => handleWordEnter(token, e)}
        onMouseLeave={handleWordLeave}
        style={{ cursor: 'pointer', padding: '0 2px', borderRadius: '4px', transition: 'background-color 0.2s', pointerEvents: 'auto' }}
        onMouseOver={(e) => { (e.target as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.2)'; (e.target as HTMLElement).style.color = '#93c5fd'; }}
        onMouseOut={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; (e.target as HTMLElement).style.color = '#ffffff'; }}
      >
        {token}
      </span>
    );
  });

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
        ) : (
          <div style={{
            position: 'absolute', bottom: '10%', left: '0', right: '0',
            display: 'flex', justifyContent: 'center', zIndex: 9999,
            pointerEvents: 'none', padding: '0 10px'
          }}>
            <div className="sprekio-subtitle-box" style={{
              backgroundColor: 'rgba(8, 12, 18, 0.82)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              padding: '10px 18px 12px', borderRadius: '14px', boxShadow: '0 8px 24px rgba(0,0,0,0.42)',
              border: '1px solid rgba(255,255,255,0.15)', textAlign: 'center', pointerEvents: 'none',
              width: 'max-content', maxWidth: 'calc(100% - 20px)', margin: '0 10px', boxSizing: 'border-box',
              display: 'inline-flex', flexDirection: 'column', alignItems: 'center'
            }}>
              <h2 className="sprekio-subtitle-text" style={{
                fontSize: '24px', fontWeight: '750', color: '#ffffff',
                lineHeight: '1.25', textShadow: '0 1px 5px rgba(0,0,0,0.9)', margin: 0
              }}>
                {visibleLines.map((line, lineIndex) => (
                  <React.Fragment key={`${line.deText}-${lineIndex}`}>
                    {lineIndex > 0 && ' '}
                    {renderTokens(line.deText)}
                  </React.Fragment>
                ))}
              </h2>
              {(translatedText || isTranslating) && (
                <p className="sprekio-subtitle-translation" style={{
                  fontSize: '20px', fontWeight: '600', marginTop: '6px', marginBottom: 0,
                  color: '#facc15', textShadow: '0 1px 4px rgba(0,0,0,0.9)',
                  opacity: isTranslating ? 0.5 : 1, transition: 'opacity 0.3s ease-in-out'
                }}>
                  {isTranslating && !translatedText ? '...' : translatedText}
                </p>
              )}
            </div>
          </div>
        )
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
                  <div key={idx} style={{ fontSize: idx === 0 ? '18px' : '15px', fontWeight: idx === 0 ? '600' : '500', color: idx === 0 ? '#2563eb' : '#4b5563', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
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
                let buttonBg = '#2563eb';
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
                    onMouseOver={(e) => { if (!buttonDisabled) (e.target as HTMLElement).style.backgroundColor = '#1d4ed8'; }}
                    onMouseOut={(e) => { if (!buttonDisabled) (e.target as HTMLElement).style.backgroundColor = '#2563eb'; }}
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
        </div>,
        controlsContainer
        )}
        
        {isEnabled && showSidebar && (
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: '350px',
            backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.2)',
            display: 'flex', flexDirection: 'column', zIndex: 100,
            color: 'white', pointerEvents: 'auto', overflow: 'hidden'
          }}>
            <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>Transcript</h3>
              <button onClick={() => setShowSidebar(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>
            
            <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isFetchingTranscript && transcript.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '20px' }}>Loading transcript...</div>
              ) : transcript.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '20px' }}>No captions available for this video.</div>
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
                        padding: '12px', borderRadius: '8px', cursor: 'pointer',
                        backgroundColor: isActive ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                        border: isActive ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
                      onMouseOut={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: isActive ? 'white' : '#e5e7eb', marginBottom: '6px' }}>
                        {line.deText}
                      </div>
                      {line.enText && (
                        <div style={{ fontSize: '14px', color: isActive ? '#93c5fd' : '#9ca3af' }}>
                          {line.enText}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
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


