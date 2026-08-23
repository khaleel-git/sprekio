import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import '../index.css';

async function fetchWordTranslation(word: string, contextSentence: string, provider: string) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "translate", word, contextSentence, provider }, resolve);
  });
}

const SprekioOverlay: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false); // Default false, will sync from storage
  const [autoPause, setAutoPause] = useState(false);
  const [provider, setProvider] = useState<"gemini" | "nvidia">("gemini");
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [transcript, setTranscript] = useState<{start: number, end: number, deText: string, enText: string}[]>([]);
  const [activeTranscriptIndex, setActiveTranscriptIndex] = useState(-1);
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false);
  
  const [liveText, setLiveText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [hoveredWord, setHoveredWord] = useState<{ word: string, rect: DOMRect } | null>(null);
  const [wordDetails, setWordDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hideTimeout = useRef<number | null>(null);
  const translationCache = useRef<Record<string, string>>({});
  const wordCache = useRef<Record<string, any>>({});
  const translationTimeout = useRef<number | null>(null);
  const activeRequest = useRef("");
  const lastPausedIndex = useRef(-1);
  const currentLineIndexRef = useRef(-1);

  const fetchTranscript = async (retryCount = 0) => {
    if (transcript.length > 0) return;
    if (retryCount === 0 && isFetchingTranscript) return;
    
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) return;

    setIsFetchingTranscript(true);
    
    try {
      const getTracksFromDOM = () => {
        return new Promise<any[]>((resolve) => {
          const script = document.createElement('script');
          const scriptId = 'sprekio-extract-' + Math.random().toString(36).substr(2, 9);
          script.id = scriptId;
          script.textContent = `
            (function() {
              try {
                let tracks = [];
                const player = document.getElementById('movie_player');
                if (player && typeof player.getPlayerResponse === 'function') {
                  const response = player.getPlayerResponse();
                  tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
                } 
                if (!tracks.length && window.ytInitialPlayerResponse) {
                  tracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
                }
                window.postMessage({ type: 'SPREKIO_TRACKS', tracks: tracks, scriptId: '${scriptId}' }, '*');
              } catch (e) {
                window.postMessage({ type: 'SPREKIO_TRACKS', tracks: [], scriptId: '${scriptId}' }, '*');
              }
            })();
          `;
          
          const listener = (event: MessageEvent) => {
            if (event.source === window && event.data && event.data.type === 'SPREKIO_TRACKS' && event.data.scriptId === scriptId) {
              window.removeEventListener('message', listener);
              const s = document.getElementById(scriptId);
              if (s) s.remove();
              resolve(event.data.tracks);
            }
          };
          
          window.addEventListener('message', listener);
          document.documentElement.appendChild(script);
          
          setTimeout(() => {
            window.removeEventListener('message', listener);
            const s = document.getElementById(scriptId);
            if (s) s.remove();
            resolve([]);
          }, 2000);
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
      
      const fetchTrack = async (track: any, forceLang?: string) => {
        if (!track) return null;
        let url = track.baseUrl + "&fmt=json3";
        if (forceLang) url += "&tlang=" + forceLang;

        const res = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage({ 
            action: "fetchSubtitles", 
            url,
            headers: {
              "X-YouTube-Client-Name": "1",
              "X-YouTube-Client-Version": "2.20240101.01.00"
            }
          }, resolve);
        });
        
        if (res.error) return null;
        return res;
      };

      const deData = await fetchTrack(deTrack || defaultTrack, !deTrack ? 'de' : undefined);
      const enData = await fetchTrack(enTrack || defaultTrack, !enTrack ? 'en' : undefined);

      if (!deData) {
        throw new Error("Failed to fetch German track JSON");
      }

      const deEvents = deData.events || [];
      const enEvents = enData?.events || [];
      
      const formatText = (segs: any[]) => segs?.map(s => s.utf8).join('').replace(/\n/g, ' ').trim() || "";
      
      const merged = deEvents.map((deEvent: any) => {
        const deText = formatText(deEvent.segs);
        const tStart = deEvent.tStartMs || 0;
        const dDur = deEvent.dDurationMs || 2000;
        const enEvent = enEvents.find((e: any) => Math.abs((e.tStartMs || 0) - tStart) < 2000);
        const enText = enEvent ? formatText(enEvent.segs) : "";
        return {
          start: tStart / 1000,
          end: (tStart + dDur) / 1000,
          deText,
          enText
        };
      }).filter((t: any) => t.deText.length > 0);
      
      if (merged.length > 0) {
        setTranscript(merged);
      } else {
        throw new Error("Merged transcript is empty");
      }
    } catch (err) {
      console.error("Sprekio transcript fetch failed:", err);
      if (retryCount < 20) {
        setTimeout(() => { setIsFetchingTranscript(false); fetchTranscript(retryCount + 1); }, 2000);
        return;
      }
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
      chrome.storage.local.get(['sprekio_isEnabled', 'sprekio_autoPause', 'sprekio_provider'], (result) => {
        if (result.sprekio_isEnabled !== undefined) setIsEnabled(result.sprekio_isEnabled as boolean);
        else setIsEnabled(true); // Default to true if never set
        
        if (result.sprekio_autoPause !== undefined) setAutoPause(result.sprekio_autoPause as boolean);
        
        if (result.sprekio_provider !== undefined) setProvider(result.sprekio_provider as "gemini" | "nvidia");

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
    let videoElem: HTMLVideoElement | null = null;
    let fallbackInterval: number | null = null;
    
    // FALLBACK: DOM Scraper (Only used if the internal API fails to fetch transcript)
    let style: HTMLStyleElement | null = null;
    const updateCaptionsFromDOM = () => {
      if (!isEnabled || transcript.length > 0) {
        if (style) {
          style.remove();
          style = null;
        }
        return;
      }
      
      // If we are using the DOM fallback, we hide the native CC to prevent overlap
      if (!style) {
        style = document.createElement('style');
        style.textContent = `.ytp-caption-window-container { opacity: 0.01 !important; pointer-events: none !important; }`;
        document.head.appendChild(style);
      }

      const segments = Array.from(document.querySelectorAll('.ytp-caption-segment'));
      const text = segments.map(s => s.textContent).join(' ').replace(/\n/g, ' ').trim();
      setLiveText(text);
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

    const handleTimeUpdate = () => {
      if (!isEnabled || transcript.length === 0) return;
      const video = document.querySelector('video');
      if (!video) return;
      
      const currentTime = video.currentTime;
      let currentIndex = -1;
      for (let i = transcript.length - 1; i >= 0; i--) {
        if (currentTime >= transcript[i].start && currentTime <= transcript[i].end) {
          currentIndex = i;
          break;
        }
      }
      
      if (currentLineIndexRef.current !== currentIndex) {
        currentLineIndexRef.current = currentIndex;
        setActiveTranscriptIndex(currentIndex);
        
        if (currentIndex !== -1) {
          setLiveText(transcript[currentIndex].deText);
        } else {
          setLiveText("");
        }
      }

      // Sidebar scrolling logic
      if (showSidebar && currentIndex !== -1) {
        const activeElem = document.getElementById(`transcript-line-${currentIndex}`);
        if (activeElem && transcriptRef.current) {
          activeElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    };

    const attachVideo = () => {
      videoElem = document.querySelector('video');
      if (videoElem) {
        videoElem.addEventListener('timeupdate', handleTimeUpdate);
        if (fallbackInterval) {
          clearInterval(fallbackInterval);
          fallbackInterval = null;
        }
      } else {
        if (!fallbackInterval) fallbackInterval = window.setInterval(attachVideo, 1000);
      }
    };

    attachVideo();

    // Language Reactor style keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && autoPause) {
        const video = document.querySelector('video');
        if (video && video.paused) {
          e.preventDefault();
          video.play();
        }
      }
      if (!isEnabled) return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      const video = document.querySelector('video');
      if (!video) return;

      const key = e.key.toLowerCase();
      if (key === 'a') {
        video.currentTime = Math.max(0, video.currentTime - 5);
      } else if (key === 'd') {
        video.currentTime += 5;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      observer.disconnect();
      if (style) style.remove();
      if (fallbackInterval) clearInterval(fallbackInterval);
      window.removeEventListener('keydown', handleKeyDown);
      if (videoElem) videoElem.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [isEnabled, autoPause, showSidebar, transcript]);

  // High-precision Auto-Pause loop using requestAnimationFrame
  useEffect(() => {
    if (!isEnabled || !autoPause || transcript.length === 0) return;

    let reqId: number;
    const checkPause = () => {
      const video = document.querySelector('video');
      if (video && !video.paused) {
        const t = video.currentTime;
        
        // Find the active line (allow a tiny 0.1s overlap to ensure smooth transitions)
        let currentIndex = -1;
        for (let i = transcript.length - 1; i >= 0; i--) {
          const line = transcript[i];
          if (t >= line.start && t <= line.end + 0.1) {
            currentIndex = i;
            break;
          }
        }
        
        if (currentIndex !== -1) {
          const line = transcript[currentIndex];
          // Pause exactly within the last 150ms of the line's end timestamp
          if (t >= line.end - 0.15 && lastPausedIndex.current !== currentIndex) {
            video.pause();
            lastPausedIndex.current = currentIndex;
          }
        }
      }
      reqId = requestAnimationFrame(checkPause);
    };
    
    reqId = requestAnimationFrame(checkPause);
    return () => cancelAnimationFrame(reqId);
  }, [isEnabled, autoPause, transcript]);

  // Translate full sentence when liveText changes
  useEffect(() => {
    if (!isEnabled || !liveText.trim()) {
      setTranslatedText("");
      setIsTranslating(false);
      return;
    }

    if (isFetchingTranscript && transcript.length === 0) {
      // Don't translate partial DOM scrapes if we are actively fetching the real transcript
      return;
    }

    // FIRST CHECK: Can we get it for free from the transcript? (Saves $$$)
    if (transcript.length > 0) {
      const strip = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const strippedLive = strip(liveText);
      const matchedLine = transcript.find(t => {
        const strippedT = strip(t.deText);
        // Match if one contains the other (since karaoke text builds up word by word)
        return strippedT && strippedLive && (strippedT.includes(strippedLive) || strippedLive.includes(strippedT));
      });

      if (matchedLine && matchedLine.enText) {
        setTranslatedText(matchedLine.enText);
        setIsTranslating(false);
        return;
      }
    }

    if (translationCache.current[liveText]) {
      setTranslatedText(translationCache.current[liveText]);
      setIsTranslating(false);
      return;
    }

    if (translationTimeout.current) clearTimeout(translationTimeout.current);
    
    // STRONG DEBOUNCE (800ms) to prevent sending 10 API requests per sentence as YouTube adds words 1-by-1
    translationTimeout.current = window.setTimeout(() => {
      setIsTranslating(true);
      activeRequest.current = liveText;
      
      chrome.runtime.sendMessage({ action: "translateSentence", text: liveText, provider }, (res) => {
        if (res && res.translation) {
          translationCache.current[liveText] = res.translation;
          if (activeRequest.current === liveText) {
            setTranslatedText(res.translation);
            setIsTranslating(false);
          }
        } else {
          if (activeRequest.current === liveText) {
            setTranslatedText("");
            setIsTranslating(false);
          }
        }
      });
    }, 800);

    return () => {
      if (translationTimeout.current) clearTimeout(translationTimeout.current);
    };
  }, [liveText, isEnabled, provider, transcript]);

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

    const details = await fetchWordTranslation(word, liveText, provider);
    wordCache.current[cacheKey] = details;
    
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
  const tokens = liveText ? liveText.split(/(\s+|[.,!?;:\"'”„“()[\]])/) : [];

  return (
    <>
      {isEnabled && (
        !liveText ? (
          <div style={{
            position: 'absolute', top: '80px', left: '20px', backgroundColor: 'rgba(20,83,45,0.9)', 
            color: 'white', padding: '10px 16px', borderRadius: '8px', zIndex: 9999,
            border: '1px solid rgba(255,255,255,0.2)', fontSize: '14px', opacity: 0.5
          }}>
            🇩🇪 Sprekio: Connected to video. (Waiting for speech...)
          </div>
        ) : (
          <div style={{
            position: 'absolute', bottom: '10%', left: '0', right: '0',
            display: 'flex', justifyContent: 'center', zIndex: 9999,
            pointerEvents: 'none', padding: '0 40px'
          }}>
            <div style={{
              backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              padding: '20px 40px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.15)', textAlign: 'center', pointerEvents: 'auto',
              maxWidth: '90%', display: 'inline-flex', flexDirection: 'column', alignItems: 'center'
            }}>
              <h2 style={{
                fontSize: '36px', fontWeight: '800', color: '#ffffff',
                lineHeight: '1.3', textShadow: '0 2px 10px rgba(0,0,0,0.9)', margin: 0
              }}>
                {tokens.map((token, i) => {
                  if (!token.trim() || /^[.,!?;:\"'”„“()[\]]+$/.test(token)) {
                    return <span key={i}>{token}</span>;
                  }
                  return (
                    <span 
                      key={i}
                      onMouseEnter={(e) => handleWordEnter(token, e)}
                      onMouseLeave={handleWordLeave}
                      style={{ cursor: 'pointer', padding: '0 2px', borderRadius: '4px', transition: 'background-color 0.2s' }}
                      onMouseOver={(e) => { (e.target as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.2)'; (e.target as HTMLElement).style.color = '#93c5fd'; }}
                      onMouseOut={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; (e.target as HTMLElement).style.color = '#ffffff'; }}
                    >
                      {token}
                    </span>
                  );
                })}
              </h2>
              {(translatedText || isTranslating) && (
                <p style={{
                  fontSize: '24px', fontWeight: '500', marginTop: '10px', marginBottom: 0,
                  color: '#fde047', textShadow: '0 1px 5px rgba(0,0,0,0.9)',
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
      {isEnabled && hoveredWord && (
        <div 
          style={{
            position: 'fixed', zIndex: 10000, backgroundColor: '#ffffff', color: '#111827',
            borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb',
            padding: '20px', minWidth: '220px', pointerEvents: 'auto',
            bottom: window.innerHeight - hoveredWord.rect.top + 15,
            left: hoveredWord.rect.left + hoveredWord.rect.width / 2,
            transform: 'translateX(-50%)'
          }}
          onMouseEnter={() => { if (hideTimeout.current) clearTimeout(hideTimeout.current); }}
          onMouseLeave={handleWordLeave}
        >
          {/* Invisible bridge to prevent hover loss when moving mouse from word to tooltip */}
          <div style={{ position: 'absolute', bottom: '-25px', left: '-10%', width: '120%', height: '30px', backgroundColor: 'transparent' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#2563eb' }}>{wordDetails.translation}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px' }}>
                {wordDetails.type && (
                  <span style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: '99px', fontWeight: '600' }}>
                    {wordDetails.type}
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
              </div>
              
              {wordDetails.root && wordDetails.root !== hoveredWord.word && (
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                  Root: <span style={{ fontWeight: '500', color: '#4b5563' }}>{wordDetails.root}</span>
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
        </div>
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
              {autoPause ? '▶️ AP' : '⏸️ AP'}
            </button>
          )}

          {isEnabled && <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as "gemini" | "nvidia")}
                title="Translation AI Provider"
                style={{
                  backgroundColor: 'transparent',
                  color: '#eee',
                  border: '1px solid #eee',
                  borderRadius: '4px',
                  padding: '2px 4px',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="gemini" style={{ color: 'black' }}>Gemini</option>
                <option value="nvidia" style={{ color: 'black' }}>NVIDIA</option>
              </select>
            }
            
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
    videoContainer.appendChild(appContainer);
    
    currentRoot = createRoot(appContainer);
    currentRoot.render(<SprekioOverlay />);
  };

  // Run immediately, and then keep checking every second to survive YouTube SPA navigations
  ensureApp();
  setInterval(ensureApp, 1000);
