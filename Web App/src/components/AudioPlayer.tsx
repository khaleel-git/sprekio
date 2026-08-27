"use client";

import { useState, useEffect } from "react";
import { Play, Pause, Square, Volume2, VolumeX, ChevronDown, ChevronUp } from "lucide-react";
import { speak, stopSpeaking, pauseSpeaking, resumeSpeaking, getGermanVoices, TTSVoice } from "@/lib/tts";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  paragraphs: string[];
  className?: string;
  onProgress?: (paragraphIndex: number, charIndex: number, charLength: number) => void;
}

export default function AudioPlayer({ paragraphs, className, onProgress }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentParagraph, setCurrentParagraph] = useState(-1);
  const [speed, setSpeed] = useState(0.9);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [supported] = useState(typeof window !== "undefined" && !!window.speechSynthesis);

  useEffect(() => {
    if (!supported) return;
    const loadVoices = () => {
      const v = getGermanVoices();
      setVoices(v);
      if (v.length > 0 && !selectedVoice) setSelectedVoice(v[0].name);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [selectedVoice, supported]);

  const playAll = async () => {
    setIsPlaying(true);
    setPaused(false);
    
    try {
      for (let i = 0; i < paragraphs.length; i++) {
        setCurrentParagraph(i);
        if (onProgress) onProgress(i, 0, 0);
        
        await speak(paragraphs[i], {
          rate: speed,
          voiceName: selectedVoice || undefined,
          onBoundary: (charIndex, charLength) => {
            if (onProgress) onProgress(i, charIndex, charLength);
          }
        });
      }
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "Stopped explicitly") {
        console.error("Speech playback error:", e);
      }
    } finally {
      setIsPlaying(false);
      setPaused(false);
      setCurrentParagraph(-1);
      if (onProgress) onProgress(-1, -1, -1);
    }
  };

  const handlePlayPause = () => {
    if (!isPlaying && !paused) {
      playAll();
    } else if (isPlaying && !paused) {
      pauseSpeaking();
      setPaused(true);
    } else if (paused) {
      resumeSpeaking();
      setPaused(false);
    }
  };

  const handleStop = () => {
    stopSpeaking();
    setIsPlaying(false);
    setPaused(false);
    setCurrentParagraph(-1);
  };

  if (!supported) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-ink/35", className)}>
        <VolumeX className="w-4 h-4" />
        <span>Audio not supported in this browser</span>
      </div>
    );
  }

  return (
    <div className={cn("bg-surface-card border border-black/10 rounded-2xl overflow-hidden", className)}>
      <div className="p-4 flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={handlePlayPause}
          className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand-dark active:scale-95 transition-all"
        >
          {isPlaying && !paused ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>

        {/* Stop */}
        {(isPlaying || paused) && (
          <button
            onClick={handleStop}
            className="w-8 h-8 rounded-full bg-black/5 text-ink/60 flex items-center justify-center hover:bg-black/10 transition-all"
          >
            <Square className="w-3 h-3" />
          </button>
        )}

        {/* Progress */}
        <div className="flex-1">
          {isPlaying || paused ? (
            <div>
              <div className="flex justify-between text-xs text-ink/45 mb-1">
                <span>{paused ? "Paused" : "Playing..."}</span>
                <span>
                  {currentParagraph + 1} / {paragraphs.length}
                </span>
              </div>
              <div className="w-full bg-black/5 rounded-full h-1.5">
                <div
                  className="bg-brand rounded-full h-1.5 transition-all"
                  style={{
                    width: `${((currentParagraph + 1) / paragraphs.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-ink/35" />
              <span className="text-sm text-ink/50">Listen to the story</span>
            </div>
          )}
        </div>

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-ink/35 hover:text-ink transition-colors"
        >
          {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-t border-black/5 px-4 py-3 bg-black/[0.02] space-y-3">
          {/* Speed */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink/50 w-12">Speed</span>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="flex-1 accent-brand"
            />
            <span className="text-xs font-medium text-ink/70 w-8">{speed}×</span>
          </div>

          {/* Voice */}
          {voices.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink/50 w-12">Voice</span>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="flex-1 text-xs bg-surface-card border border-black/10 rounded-lg px-2 py-1 text-ink/70"
              >
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} {v.localService ? "🔊" : "🌐"}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
