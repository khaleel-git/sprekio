"use client";

import { useState } from "react";
import { VocabCard } from "@/lib/srs";
import { useStore } from "@/lib/store";
import { Volume2, RotateCcw, Trash2 } from "lucide-react";
import { speak } from "@/lib/tts";
import { cn } from "@/lib/utils";

interface VocabCardComponentProps {
  card: VocabCard;
  onReview: (quality: 0 | 1 | 2 | 3 | 4 | 5) => void;
}

export default function VocabCardComponent({ card, onReview }: VocabCardComponentProps) {
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const { removeVocabCard } = useStore();

  const handleFlip = () => {
    if (!flipped) {
      speak(card.word);
    }
    setFlipped(!flipped);
  };

  const handleQuality = (quality: 0 | 1 | 2 | 3 | 4 | 5) => {
    setReviewed(true);
    onReview(quality);
  };

  const qualityButtons = [
    { label: "Again", quality: 1 as const, color: "bg-red-100 text-red-700 hover:bg-red-200 border-red-200" },
    { label: "Hard", quality: 2 as const, color: "bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200" },
    { label: "Good", quality: 4 as const, color: "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200" },
    { label: "Easy", quality: 5 as const, color: "bg-green-100 text-green-700 hover:bg-green-200 border-green-200" },
  ];

  if (reviewed) {
    return (
      <div className="text-center py-8 text-gray-400 animate-fade-in">
        <div className="text-3xl mb-2">✓</div>
        <p className="text-sm">Card reviewed!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Card */}
      <div
        onClick={handleFlip}
        className={cn(
          "bg-white rounded-2xl border border-gray-200 shadow-sm cursor-pointer",
          "hover:shadow-md transition-all duration-200 min-h-[200px]",
          "flex flex-col items-center justify-center p-8 text-center select-none"
        )}
        style={{ perspective: "1000px" }}
      >
        {!flipped ? (
          // Front: German word
          <div className="animate-fade-in">
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-wider">Deutsch</p>
            <p className="text-3xl font-bold text-gray-900 mb-2">{card.word}</p>
            <p className="text-xs text-gray-400 mt-4">Tap to reveal translation</p>
          </div>
        ) : (
          // Back: Translation + example
          <div className="animate-fade-in w-full">
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-wider">English</p>
            <p className="text-2xl font-bold text-blue-600 mb-3">{card.translation}</p>
            {card.example && (
              <div className="bg-blue-50 rounded-xl px-4 py-3 mt-2 text-left">
                <p className="text-xs text-blue-400 mb-1">Example</p>
                <p className="text-sm text-blue-800 font-medium italic">{card.example}</p>
              </div>
            )}
            <div className="mt-3 text-xs text-gray-400">
              From: <span className="text-gray-600">{card.storyTitle}</span>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => speak(card.word)}
          className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-all"
          title="Listen"
        >
          <Volume2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setFlipped(false)}
          className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all"
          title="Flip back"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={() => removeVocabCard(card.id)}
          className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300 transition-all"
          title="Remove card"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Quality buttons (only after flip) */}
      {flipped && (
        <div className="animate-slide-up">
          <p className="text-xs text-center text-gray-400 mb-2">How well did you know this?</p>
          <div className="grid grid-cols-4 gap-2">
            {qualityButtons.map((btn) => (
              <button
                key={btn.label}
                onClick={() => handleQuality(btn.quality)}
                className={cn(
                  "py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95",
                  btn.color
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
