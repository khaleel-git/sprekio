"use client";

import { useState } from "react";
import { VocabCard } from "@/lib/srs";
import { Volume2, RotateCcw, Trash2 } from "lucide-react";
import { speak } from "@/lib/tts";
import { cn } from "@/lib/utils";

interface VocabCardComponentProps {
  card: VocabCard;
  onReview: (quality: 0 | 1 | 2 | 3 | 4 | 5) => void;
  onRemove: () => void;
  /** Where this word came from — a story title for the guest deck, a video title for a Firestore word. */
  sourceLabel?: string;
}

const qualityButtons = [
  { label: "Again", quality: 1 as const, color: "bg-red-100 text-red-700 hover:bg-red-200 border-red-200" },
  { label: "Hard", quality: 2 as const, color: "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200" },
  { label: "Good", quality: 4 as const, color: "bg-brand-light text-brand-dark hover:bg-brand/20 border-brand/20" },
  { label: "Easy", quality: 5 as const, color: "bg-green-100 text-green-700 hover:bg-green-200 border-green-200" },
];

export default function VocabCardComponent({ card, onReview, onRemove, sourceLabel }: VocabCardComponentProps) {
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  const handleFlip = () => {
    if (!flipped) speak(card.word);
    setFlipped(!flipped);
  };

  const handleQuality = (quality: 0 | 1 | 2 | 3 | 4 | 5) => {
    setReviewed(true);
    onReview(quality);
  };

  if (reviewed) {
    return (
      <div className="text-center py-8 text-ink/40 animate-fade-in">
        <div className="text-3xl mb-2">✓</div>
        <p className="text-sm">Card reviewed!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onClick={handleFlip}
        className={cn(
          "bg-surface-card rounded-2xl border border-black/10 shadow-sm cursor-pointer",
          "hover:shadow-md transition-all duration-200 min-h-[200px]",
          "flex flex-col items-center justify-center p-8 text-center select-none"
        )}
      >
        {!flipped ? (
          <div className="animate-fade-in">
            <p className="text-xs text-ink/35 mb-3 uppercase tracking-wider">Deutsch</p>
            <p className="text-3xl font-display font-semibold text-ink mb-2">{card.word}</p>
            <p className="text-xs text-ink/35 mt-4">Tap to reveal translation</p>
          </div>
        ) : (
          <div className="animate-fade-in w-full">
            <p className="text-xs text-ink/35 mb-3 uppercase tracking-wider">English</p>
            <p className="text-2xl font-semibold text-brand-dark mb-3">{card.translation}</p>
            {card.example && (
              <div className="bg-brand-light rounded-xl px-4 py-3 mt-2 text-left">
                <p className="text-xs text-brand-dark/60 mb-1">Example</p>
                <p className="text-sm text-brand-dark font-medium italic">{card.example}</p>
              </div>
            )}
            {sourceLabel && (
              <div className="mt-3 text-xs text-ink/35">
                From: <span className="text-ink/60">{sourceLabel}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => speak(card.word)}
          className="p-2 rounded-xl border border-black/10 text-ink/35 hover:text-brand hover:border-brand/40 transition-all"
          title="Listen"
        >
          <Volume2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setFlipped(false)}
          className="p-2 rounded-xl border border-black/10 text-ink/35 hover:text-ink hover:border-black/20 transition-all"
          title="Flip back"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={onRemove}
          className="p-2 rounded-xl border border-black/10 text-ink/35 hover:text-red-500 hover:border-red-300 transition-all"
          title="Remove card"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {flipped && (
        <div className="animate-slide-up">
          <p className="text-xs text-center text-ink/35 mb-2">How well did you know this?</p>
          <div className="grid grid-cols-4 gap-2">
            {qualityButtons.map((btn) => (
              <button
                key={btn.label}
                onClick={() => handleQuality(btn.quality)}
                className={cn("py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95", btn.color)}
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
