"use client";

import { useState, useEffect, useRef, Suspense, useMemo } from "react";
import YouTube from "react-youtube";
import { useSearchParams } from "next/navigation";
import { PlayCircle, Pause, Loader2, X, BookmarkPlus } from "lucide-react";
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
    let finalTimeout: NodeJS.Timeout;
    let dispatchInterval: NodeJS.Timeout;
    let settled = false;
    // The background-bridge path (chrome.runtime → fetchTranscriptDirect) typically
    // resolves within milliseconds, while the iframe relay has to wait on the native
    // player's own caption request — which can take several seconds. Settling on
    // whichever answers *first* let the fast-but-often-wrong background path lock in
    // an "empty captions" error moments before the slower-but-correct iframe relay
    // found the real transcript. Only a genuinely non-empty transcript settles things
    // immediately; every error/empty result is held as a fallback and real content
    // from any source can still win up until the final timeout.
    let fallbackMessage: string | null = null;

    const teardown = () => {
      settled = true;
      clearTimeout(finalTimeout);
      clearInterval(dispatchInterval);
      window.removeEventListener('SPREKIO_TRANSCRIPT_RESULT', onResult);
      window.removeEventListener('message', onIframeMessage);
    };

    const succeed = (xml: string) => {
      if (settled) return;
      teardown();
      parseXmlTranscript(xml);
    };

    // The iframe relay pre-normalizes both caption formats it might intercept
    // (json3 and two XML variants) into a plain {text, start, duration}[] (ms) —
    // see transcriptRelay.ts — so this path never needs to guess a format itself.
    const succeedWithLines = (lines: { text: string; start: number; duration: number }[]) => {
      if (settled) return;
      teardown();
      const parsed: TranscriptLine[] = lines.map((l, i) => ({
        id: i,
        start: l.start / 1000,
        end: (l.start + l.duration) / 1000,
        text: l.text,
      }));
      setTranscript(parsed);
      setIsLoading(false);
    };

    const fail = (message: string) => {
      if (settled) return;
      teardown();
      setTranscript([{ id: 0, start: 0, end: 9999, text: `Error: ${message}` }]);
      setIsLoading(false);
    };

    // Attempt 0 (slower to arrive, but the only one that reliably works): the embedded
    // YouTube iframe itself relays a transcript via postMessage — see
    // transcriptRelay.ts. It captures the *native player's own* signed caption
    // request, which a blind background fetch (Attempt 1) can never reproduce, since
    // modern caption URLs require a session-bound token only a real page request has.
    const onIframeMessage = (e: MessageEvent) => {
      if (e.origin !== "https://www.youtube.com") return;
      if (e.data?.type !== "SPREKIO_IFRAME_TRANSCRIPT" || e.data.videoId !== videoId) return;
      if (Array.isArray(e.data.lines) && e.data.lines.length > 0) {
        succeedWithLines(e.data.lines);
      } else if (e.data.error) {
        // Most trustworthy source we have — prefer it over whatever the background
        // path already said, but still don't render it until the final timeout in
        // case the background path (or a retry) still comes back with real content.
        console.warn("Embedded player reported a transcript error:", e.data.error);
        fallbackMessage = e.data.error;
      }
    };
    window.addEventListener('message', onIframeMessage);

    const onResult = (e: any) => {
      if (e.detail.reqId !== reqId) return;
      const response = e.detail.response;
      if (response && typeof response.xml === "string" && response.xml) {
         succeed(response.xml);
      } else if (response?.error) {
         console.warn("Extension reported a transcript error:", response.error);
         fallbackMessage = fallbackMessage || response.error;
      }
      // An empty (but present) response.xml is deliberately treated the same as an
      // error here rather than as "confirmed no captions" — we've seen this exact
      // background path return an empty body for videos that do have captions, so
      // it isn't proof of anything on its own; only the iframe relay's empty-with-no-
      // request-observed case is trusted as a real "no captions" answer.
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

    // Give every path a real chance before falling back. The iframe relay alone can
    // take up to ~23s (3s hunting for a CC button that often doesn't exist in this
    // embed context, plus up to 20s polling for the native player's own caption
    // request — measured live, its first attempt is frequently aborted and only a
    // retry succeeds, sometimes 10+ seconds in). If nothing succeeded but we have a
    // specific, trustworthy error by then, show that instead of burning more time on
    // the backend, which has proven reliably unable to fetch captions at all.
    finalTimeout = setTimeout(() => {
      if (settled) return;
      if (fallbackMessage) {
        fail(fallbackMessage);
      } else {
        teardown();
        console.warn("No transcript and no specific error from any source, falling back to backend.");
        fetchBackendTranscript();
      }
    }, 24000);

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

    return teardown;
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

    const cleanWord = word.replace(/[.,!?()[\]{}"':;]/g, '').trim();
    const rect = (e.target as HTMLElement).getBoundingClientRect();

    setDictWord({
      word: cleanWord,
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
          word: cleanWord,
          contextSentence,
          provider: "nvidia" // Fast lookups!
        })
      });
      const data = await res.json();
      // Backend responds { status: 'found', result: {...} } on a hit, or
      // { status: 'not_found', surface } otherwise — neither shape is a DictResult
      // on its own, so reading `data` directly always produced an empty popup.
      if (data.result) {
        setDictData(data.result);
      } else {
        setDictData({
          surface: cleanWord,
          normalized: cleanWord.toLowerCase(),
          lemma: cleanWord,
          translations: [{ text: "No translation found" }],
          source: "dictionary",
          cached: false,
          confidence: 0,
        });
      }
    } catch (err) {
      setDictData({
        surface: cleanWord,
        normalized: cleanWord.toLowerCase(),
        lemma: cleanWord,
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

  const renderClickableWords = (text: string, contextSentence: string, wordClassName: string) =>
    text.split(" ").map((word, wIdx) => (
      <span
        key={wIdx}
        onClick={(e) => handleWordClick(e, word, contextSentence)}
        className={cn("cursor-pointer rounded transition-colors px-0.5", wordClassName)}
      >
        {word}{" "}
      </span>
    ));

  return (
    <div>
      <div className="flex flex-col gap-6">

        {/* Video: full-width theater layout, big and stretched */}
        <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-lg relative">
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

          {/* Closed-caption bar burned into the bottom of the player — always on,
              and interactive: each word is clickable for an in-context translation
              lookup, just like the transcript panel below. The rest of the video
              stays click-through (pointer-events-none) so the caption bar doesn't
              swallow clicks meant for YouTube's own controls. */}
          {currentLine && (
            <div className="absolute inset-x-0 bottom-0 pb-14 md:pb-16 px-4 flex justify-center pointer-events-none">
              <div className="pointer-events-auto bg-black/75 backdrop-blur-sm text-white px-5 py-2.5 md:px-6 md:py-3 rounded-xl max-w-[90%] text-center text-lg md:text-2xl font-medium leading-snug">
                {renderClickableWords(currentLine.text, currentLine.text, "hover:bg-white/20")}
              </div>
            </div>
          )}
        </div>

        {/* Header + controls */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink mb-1">Interactive Player</h1>
            <p className="text-ink/50">Click any word — in the captions or the transcript — to translate it in context.</p>
          </div>

          <button
            onClick={() => setAutoPause(!autoPause)}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 shrink-0",
              autoPause
                ? "bg-brand-light text-brand-dark border-brand/30 shadow-sm"
                : "bg-surface-card text-ink/50 border-black/10 hover:bg-black/[0.03]"
            )}
            title="Automatically pause at the end of each sentence"
          >
            {autoPause ? <Pause className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
            Auto-Pause {autoPause ? "ON" : "OFF"}
          </button>
        </div>

        {/* Transcript: wide panel below the video */}
        <div className="bg-surface-card rounded-2xl border border-black/10 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-black/5 bg-black/[0.02] shrink-0">
            <h2 className="font-bold text-ink">Transcript</h2>
          </div>

          <div ref={transcriptRef} className="max-h-[520px] overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-3 content-start relative">
            {isLoading ? (
              <div className="col-span-full h-40 flex flex-col items-center justify-center text-ink/35 gap-3">
                 <Loader2 className="w-6 h-6 animate-spin" />
                 <p className="text-sm font-medium">Loading Transcript...</p>
              </div>
            ) : transcript.length === 0 ? (
              <div className="col-span-full text-center text-ink/35 py-10">No German captions found for this video.</div>
            ) : (
              transcript.map((line, i) => {
                const isActive = i === activeIndex;
                return (
                  <div
                    key={line.id}
                    className={cn(
                      "p-4 rounded-xl transition-colors text-[16px] leading-loose relative group",
                      isActive
                        ? "bg-brand-light/80 border border-brand/20 shadow-sm"
                        : "hover:bg-black/[0.03] border border-transparent"
                    )}
                  >
                    {/* Play line button */}
                    <button
                      onClick={() => seekTo(line.start)}
                      className={cn(
                        "absolute -left-2 top-4 -ml-2 p-1 rounded-full bg-surface-card border border-black/10 text-ink/35 opacity-0 group-hover:opacity-100 hover:text-brand transition-all shadow-sm",
                        isActive && "opacity-100 text-brand border-brand/30"
                      )}
                    >
                      <PlayCircle className="w-4 h-4" />
                    </button>

                    <div className="ml-4">
                      {renderClickableWords(
                        line.text,
                        line.text,
                        cn("hover:bg-brand hover:text-white", isActive ? "text-brand-dark font-medium" : "text-ink/70")
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Dictionary Popup Overlay */}
      {dictWord && (
        <>
          {/* Invisible backdrop to catch clicks and close */}
          <div className="fixed inset-0 z-40" onClick={() => setDictWord(null)} />
          
          <div
            className="fixed z-50 bg-surface-card rounded-2xl shadow-2xl border border-black/10 w-80 overflow-hidden animate-fade-in"
            style={{
              // Position smartly to not overflow screen
              left: Math.min(dictWord.x - 160, window.innerWidth - 340 > 0 ? window.innerWidth - 340 : 10) + 'px',
              top: Math.min(dictWord.y, window.innerHeight - 300) + 'px'
            }}
          >
            <div className="p-4 bg-black/[0.02] border-b border-black/5 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-display font-semibold text-ink">{dictWord.word}</h3>
                {dictData?.lemma && dictData.lemma !== dictWord.word && (
                  <p className="text-sm text-ink/45 font-medium">Lemma: {dictData.lemma}</p>
                )}
              </div>
              <button onClick={() => setDictWord(null)} className="p-1 hover:bg-black/5 rounded-lg transition-colors">
                <X className="w-5 h-5 text-ink/45" />
              </button>
            </div>

            <div className="p-4">
              {isDictLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-brand" />
                </div>
              ) : dictData ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink/35 mb-1 block">Translation</span>
                    {dictData.translations?.map((t, idx) => (
                      <p key={idx} className={cn("font-medium", idx === 0 ? "text-lg text-brand-dark" : "text-sm text-ink/60")}>
                        {t.text}
                      </p>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-black/5 items-center">
                    {dictData.partOfSpeech && (
                      <span className="text-xs font-medium bg-black/5 text-ink/70 px-2 py-1 rounded-md">
                        {dictData.partOfSpeech}
                      </span>
                    )}
                    {dictData.gender && (
                      <span className="text-xs font-medium bg-brand-light text-brand-dark border border-brand/20 px-2 py-1 rounded-md">
                        {dictData.gender}
                      </span>
                    )}
                    {dictData.case && (
                      <span className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100 px-2 py-1 rounded-md">
                        {dictData.case}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-[10px] text-ink/35 font-medium uppercase tracking-wider">
                        {dictData.source === 'ai' ? '🤖 AI' : '📖 Dict'}{dictData.cached && ' ⚡'}
                      </span>
                      {dictData.confidence !== undefined && (
                        <span className="text-[10px] text-ink/35">
                          {dictData.confidence >= 0.9 ? '(High)' : dictData.confidence >= 0.7 ? '(Likely)' : '(Contextual)'}
                        </span>
                      )}
                    </div>
                  </div>

                  <button className="w-full mt-2 py-2.5 bg-ink hover:bg-ink/85 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
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

    </div>
  );
}

export default function WatchPlayerPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand" /></div>}>
      <PlayerContent />
    </Suspense>
  );
}
