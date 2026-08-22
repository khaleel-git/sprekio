"use client";

import { useState, useEffect } from "react";
import { Play, Pause, Square, Volume2, VolumeX, ChevronDown, ChevronUp } from "lucide-react";
import { speak, stopSpeaking, pauseSpeaking, resumeSpeaking, isSpeaking, isPaused, getGermanVoices, TTSVoice } from "@/lib/tts";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  paragraphs: string[];
  className?: string;
}

export default function AudioPlayer({ paragraphs, className }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentParagraph, setCurrentParagraph] = useState(-1);
  const [speed, setSpeed] = useState(0.9);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setSupported(false);
      return;
    }

    const loadVoices = () => {
      const v = getGermanVoices();
      setVoices(v);
      if (v.length > 0 && !selectedVoice) {
        setSelectedVoice(v[0].name);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const playAll = async () => {
    setIsPlaying(true);
    setPaused(false);
    for (let i = 0; i < paragraphs.length; i++) {
      setCurrentParagraph(i);
      await speak(paragraphs[i], {
        rate: speed,
        voiceName: selectedVoice || undefined,
      });
    }
    setIsPlaying(false);
    setCurrentParagraph(-1);
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
      <div className={cn("flex items-center gap-2 text-sm text-gray-400", className)}>
        <VolumeX className="w-4 h-4" />
        <span>Audio not supported in this browser</span>
      </div>
    );
  }

  return (
    <div className={cn("bg-white border border-gray-200 rounded-2xl overflow-hidden", className)}>
      <div className="p-4 flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={handlePlayPause}
          className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all"
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
            className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-all"
          >
            <Square className="w-3 h-3" />
          </button>
        )}

        {/* Progress */}
        <div className="flex-1">
          {isPlaying || paused ? (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{paused ? "Paused" : "Playing..."}</span>
                <span>
                  {currentParagraph + 1} / {paragraphs.length}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-blue-500 rounded-full h-1.5 transition-all"
                  style={{
                    width: `${((currentParagraph + 1) / paragraphs.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">Listen to the story</span>
            </div>
          )}
        </div>

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
          {/* Speed */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-12">Speed</span>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-xs font-medium text-gray-700 w-8">{speed}×</span>
          </div>

          {/* Voice */}
          {voices.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-12">Voice</span>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-700"
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
