"use client";

import { useState, useEffect, useRef, Suspense, useMemo } from "react";
import YouTube from "react-youtube";
import { useSearchParams } from "next/navigation";
import { PlayCircle, Pause, Settings, Info, Loader2, X, BookmarkPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TranscriptLine {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface SprekioTranslation {
  text: string;
  definition?: string;
  confidence?: number;
}

interface DictResult {
  surface: string;
  normalized: string;
  lemma: string;
  translations: SprekioTranslation[];
  partOfSpeech?: string;
  gender?: string;
  case?: string;
  confidence: number;
  source: "dictionary" | "ai";
  cached: boolean;
  contextUsed?: boolean;
  error?: string;
}

function PlayerContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("v") || "";
  
  const [currentTime, setCurrentTime] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [autoPause, setAutoPause] = useState(false);
  const [lastAutoPausedId, setLastAutoPausedId] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [dictWord, setDictWord] = useState<{word: string, context: string, x: number, y: number} | null>(null);
  const [dictData, setDictData] = useState<DictResult | null>(null);
  const [isDictLoading, setIsDictLoading] = useState(false);

  const playerRef = useRef<any>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  
  // Fetch transcript
  useEffect(() => {
    if (!videoId) return;
    setIsLoading(true);
    
    // Attempt 1: Fetch via Chrome Extension (bypasses datacenter IP blocks using user's browser)
    const reqId = Date.now().toString();
    let extensionTimeout: NodeJS.Timeout;
    let dispatchInterval: NodeJS.Timeout;
    
    const onResult = (e: any) => {
      if (e.detail.reqId === reqId) {
        clearTimeout(extensionTimeout);
        clearInterval(dispatchInterval);
        window.removeEventListener('SPREKIO_TRANSCRIPT_RESULT', onResult);
        
        const response = e.detail.response;
        if (response && response.xml) {
           parseXmlTranscript(response.xml);
        } else {
           // Extension failed, fallback to backend
           console.warn("Extension failed to fetch transcript:", response?.error);
           fetchBackendTranscript();
        }
      }
    };
    
    window.addEventListener('SPREKIO_TRANSCRIPT_RESULT', onResult);
    
    // Dispatch to extension repeatedly in case it hasn't loaded yet (race condition)
    dispatchInterval = setInterval(() => {
      window.dispatchEvent(new CustomEvent('SPREKIO_FETCH_TRANSCRIPT', {
        detail: { videoId, reqId }
      }));
    }, 300);
    
    // Initial dispatch
    window.dispatchEvent(new CustomEvent('SPREKIO_FETCH_TRANSCRIPT', {
      detail: { videoId, reqId }
    }));
    
    // If extension is not installed or takes > 5s, fallback to backend
    extensionTimeout = setTimeout(() => {
      clearInterval(dispatchInterval);
      window.removeEventListener('SPREKIO_TRANSCRIPT_RESULT', onResult);
      console.warn("Chrome Extension not detected or timed out, falling back to backend API.");
      fetchBackendTranscript();
    }, 5000);
    
    function parseXmlTranscript(xml: string) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, "text/xml");
        const texts = doc.getElementsByTagName("text");
        const parsed: TranscriptLine[] = [];
        for (let i = 0; i < texts.length; i++) {
          const t = texts[i];
          const start = parseFloat(t.getAttribute("start") || "0");
          const dur = parseFloat(t.getAttribute("dur") || "0");
          const text = t.textContent?.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') || "";
          parsed.push({ id: i, start, end: start + dur, text: text.trim() });
        }
        setTranscript(parsed.filter(t => t.text.length > 0));
        setIsLoading(false);
    }

    function fetchBackendTranscript() {
      fetch('https://sprekio-backend.khaleel-eu.workers.dev/api/transcript?v=' + videoId)
        .then(res => res.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          
          const parsed: TranscriptLine[] = [];
          const tracks = data.transcript || [];
          
          for (let i = 0; i < tracks.length; i++) {
            const t = tracks[i];
            const start = t.offset / 1000;
            const dur = t.duration / 1000;
            const text = t.text.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') || "";
            parsed.push({ id: i, start, end: start + dur, text: text.trim() });
          }
          
          setTranscript(parsed.filter(t => t.text.length > 0));
          setIsLoading(false);
        })
        .catch(err => {
          console.error(err);
          // If BOTH fail, set an error message in transcript
          setTranscript([{ id: 0, start: 0, end: 9999, text: "Error: Could not load captions. YouTube blocking Datacenter IPs. Please install Sprekio Chrome Extension to fix." }]);
          setIsLoading(false);
        });
    }

  }, [videoId]);

  // Sync player time and handle auto-pause
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current && playerRef.current.internalPlayer) {
        playerRef.current.internalPlayer.getCurrentTime().then((time: number) => {
          setCurrentTime(time);
          
          if (autoPause && isPlaying) {
             const activeLine = transcript.find(t => time >= t.start && time <= t.end);
             // If we just passed a line's end, or if we're near the end of the active line
             if (activeLine && time >= activeLine.end - 0.2 && lastAutoPausedId !== activeLine.id) {
                playerRef.current.internalPlayer.pauseVideo();
                setLastAutoPausedId(activeLine.id);
             }
          }
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [autoPause, isPlaying, transcript, lastAutoPausedId]);

  // Scroll active transcript line into view
  const activeIndex = useMemo(() => {
    return transcript.findIndex(t => currentTime >= t.start && currentTime <= t.end);
  }, [currentTime, transcript]);

  useEffect(() => {
    if (activeIndex >= 0 && transcriptRef.current) {
      const activeEl = transcriptRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeIndex]);

  const onReady = (e: any) => {
    playerRef.current = e.target;
  };
  
  const onStateChange = (e: any) => {
    // 1 = playing, 2 = paused
    if (e.data === 1) {
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  const seekTo = (time: number) => {
    if (playerRef.current && playerRef.current.internalPlayer) {
      playerRef.current.internalPlayer.seekTo(time);
      playerRef.current.internalPlayer.playVideo();
    }
  };

  const handleWordClick = async (e: React.MouseEvent, word: string, contextSentence: string) => {
    e.stopPropagation();
    
    // Pause video when opening dictionary
    if (playerRef.current && playerRef.current.internalPlayer) {
      playerRef.current.internalPlayer.pauseVideo();
    }
    
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    
    setDictWord({
      word: word.replace(/[.,!?()[\]{}"':;]/g, '').trim(), // Clean punctuation
      context: contextSentence,
      x: rect.left,
      y: rect.bottom + 10
    });
    setDictData(null);
    setIsDictLoading(true);

    try {
      const res = await fetch("https://sprekio-backend.khaleel-eu.workers.dev/api/translate-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: word.replace(/[.,!?()[\]{}"':;]/g, '').trim(),
          contextSentence,
          provider: "nvidia" // Fast lookups!
        })
      });
      const data = await res.json();
      setDictData(data);
    } catch (err) {
      setDictData({ 
        surface: word.replace(/[.,!?()[\]{}"':;]/g, '').trim(),
        normalized: word.replace(/[.,!?()[\]{}"':;]/g, '').trim().toLowerCase(),
        lemma: word.replace(/[.,!?()[\]{}"':;]/g, '').trim(),
        translations: [{ text: "Error fetching translation" }], 
        source: "ai",
        cached: false,
        confidence: 0,
        error: String(err) 
      });
    } finally {
      setIsDictLoading(false);
    }
  };

  const currentLine = activeIndex >= 0 ? transcript[activeIndex] : null;

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-8 relative">
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Left Column: Video */}
        <div className="flex-1 min-w-0">
          <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-sm mb-6 relative group">
            <YouTube
              videoId={videoId}
              opts={{
                width: "100%",
                height: "100%",
                playerVars: {
                  autoplay: 1,
                  rel: 0,
                  modestbranding: 1,
                },
              }}
              onReady={onReady}
              onStateChange={onStateChange}
              className="absolute inset-0 w-full h-full"
              iframeClassName="w-full h-full border-none"
            />
            
            {/* On-Screen Subtitle Overlay */}
            {currentLine && (
               <div className="absolute bottom-12 left-0 w-full flex justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                 <div className="bg-black/70 backdrop-blur-sm text-white px-6 py-2 rounded-xl text-xl font-medium max-w-[80%] text-center">
                   {currentLine.text}
                 </div>
               </div>
            )}
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">Interactive Player</h1>
          <p className="text-gray-500 mb-8">Hover over the video to see on-screen subtitles. Click any word in the transcript to translate it in context!</p>
        </div>

        {/* Right Column: Transcript */}
        <div className="w-full lg:w-[420px] flex-shrink-0 relative">
          <div className="sticky top-20 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-120px)]">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-gray-900">Transcript</h2>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setAutoPause(!autoPause)}
                  className={cn(
                    "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5",
                    autoPause 
                      ? "bg-violet-50 text-violet-700 border-violet-200 shadow-sm" 
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  )}
                  title="Automatically pause at the end of each sentence"
                >
                  {autoPause ? <Pause className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  Auto-Pause {autoPause ? "ON" : "OFF"}
                </button>
              </div>
            </div>
            
            <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-3 relative">
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                   <Loader2 className="w-6 h-6 animate-spin" />
                   <p className="text-sm font-medium">Loading Transcript...</p>
                </div>
              ) : transcript.length === 0 ? (
                <div className="text-center text-gray-400 py-10">No German captions found for this video.</div>
              ) : (
                transcript.map((line, i) => {
                  const isActive = i === activeIndex;
                  return (
                    <div
                      key={line.id}
                      className={cn(
                        "p-4 rounded-xl transition-colors text-[16px] leading-loose relative group",
                        isActive 
                          ? "bg-blue-50/80 border border-blue-100 shadow-sm" 
                          : "hover:bg-gray-50 border border-transparent"
                      )}
                    >
                      {/* Play line button */}
                      <button 
                        onClick={() => seekTo(line.start)}
                        className={cn(
                          "absolute -left-2 top-4 -ml-2 p-1 rounded-full bg-white border border-gray-200 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 transition-all shadow-sm",
                          isActive && "opacity-100 text-blue-500 border-blue-200"
                        )}
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>

                      <div className="ml-4">
                        {line.text.split(" ").map((word, wIdx) => (
                          <span
                            key={wIdx}
                            onClick={(e) => handleWordClick(e, word, line.text)}
                            className={cn(
                              "cursor-pointer rounded hover:bg-blue-200 transition-colors px-0.5",
                              isActive ? "text-blue-900 font-medium" : "text-gray-700"
                            )}
                          >
                            {word}{" "}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Dictionary Popup Overlay */}
      {dictWord && (
        <>
          {/* Invisible backdrop to catch clicks and close */}
          <div className="fixed inset-0 z-40" onClick={() => setDictWord(null)} />
          
          <div 
            className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 w-80 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            style={{
              // Position smartly to not overflow screen
              left: Math.min(dictWord.x - 160, window.innerWidth - 340 > 0 ? window.innerWidth - 340 : 10) + 'px',
              top: Math.min(dictWord.y, window.innerHeight - 300) + 'px'
            }}
          >
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{dictWord.word}</h3>
                {dictData?.lemma && dictData.lemma !== dictWord.word && (
                  <p className="text-sm text-gray-500 font-medium">Lemma: {dictData.lemma}</p>
                )}
              </div>
              <button onClick={() => setDictWord(null)} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-4">
              {isDictLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : dictData ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 block">Translation</span>
                    {dictData.translations?.map((t, idx) => (
                      <p key={idx} className={cn("font-medium", idx === 0 ? "text-lg text-blue-700" : "text-sm text-gray-600")}>
                        {t.text}
                      </p>
                    ))}
                  </div>
                  
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 items-center">
                    {dictData.partOfSpeech && (
                      <span className="text-xs font-medium bg-gray-100 text-gray-700 px-2 py-1 rounded-md">
                        {dictData.partOfSpeech}
                      </span>
                    )}
                    {dictData.gender && (
                      <span className="text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100 px-2 py-1 rounded-md">
                        {dictData.gender}
                      </span>
                    )}
                    {dictData.case && (
                      <span className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100 px-2 py-1 rounded-md">
                        {dictData.case}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                        {dictData.source === 'ai' ? '🤖 AI' : '📖 Dict'}{dictData.cached && ' ⚡'}
                      </span>
                      {dictData.confidence !== undefined && (
                        <span className="text-[10px] text-gray-400">
                          {dictData.confidence >= 0.9 ? '(High)' : dictData.confidence >= 0.7 ? '(Likely)' : '(Contextual)'}
                        </span>
                      )}
                    </div>
                  </div>

                  <button className="w-full mt-2 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                    <BookmarkPlus className="w-4 h-4" /> Save to Vault
                  </button>
                </div>
              ) : (
                <p className="text-sm text-red-500">Failed to load translation.</p>
              )}
            </div>
          </div>
        </>
      )}

    </main>
  );
}

export default function WatchPlayerPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>}>
      <PlayerContent />
    </Suspense>
  );
}
