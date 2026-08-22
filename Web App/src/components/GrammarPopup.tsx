"use client";

import { WordAnnotation, CASE_COLORS, WORD_TYPE_COLORS } from "@/lib/stories";
import { cn } from "@/lib/utils";
import { X, BookmarkPlus, Volume2 } from "lucide-react";
import { speak } from "@/lib/tts";

interface GrammarPopupProps {
  word: WordAnnotation;
  onClose: () => void;
  onSaveVocab: (word: WordAnnotation) => void;
  isSaved: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  noun: "Substantiv (Noun)",
  verb: "Verb",
  adjective: "Adjektiv (Adjective)",
  adverb: "Adverb",
  preposition: "Präposition (Preposition)",
  conjunction: "Konjunktion (Conjunction)",
  pronoun: "Pronomen (Pronoun)",
  article: "Artikel (Article)",
  phrase: "Phrase / Ausdruck",
};

const GENDER_ARTICLES: Record<string, string> = {
  masculine: "der",
  feminine: "die",
  neuter: "das",
};

const CASE_EXPLANATIONS: Record<string, string> = {
  Nominativ: "Subject — who/what does the action",
  Akkusativ: "Direct object — whom/what the action affects",
  Dativ: "Indirect object — to/for whom",
  Genitiv: "Possession — whose",
};

export default function GrammarPopup({
  word,
  onClose,
  onSaveVocab,
  isSaved,
}: GrammarPopupProps) {
  const handleSpeak = () => {
    speak(word.word);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-slide-up overflow-hidden">
        {/* Header */}
        <div className={cn("px-5 pt-5 pb-3", "border-b border-gray-100")}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-gray-900">{word.word}</span>
                <button
                  onClick={handleSpeak}
                  className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-base text-blue-600 font-medium mt-0.5">{word.translation}</p>
              {word.base && word.base !== word.word && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Base form: <span className="font-medium text-gray-600">{word.base}</span>
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="px-5 py-4 space-y-3">
          {/* Word type */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100",
                WORD_TYPE_COLORS[word.type] || "text-gray-600"
              )}
            >
              {TYPE_LABELS[word.type] || word.type}
            </span>
            {word.separable && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                Separable verb ✂️
              </span>
            )}
          </div>

          {/* Gender (for nouns) */}
          {word.gender && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Gender:</span>
              <span className="font-semibold text-gray-800">
                {GENDER_ARTICLES[word.gender]}{" "}
                <span className="text-gray-500 font-normal capitalize">({word.gender})</span>
              </span>
            </div>
          )}

          {/* Case */}
          {word.case && (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={cn(
                    "w-3 h-3 rounded-full",
                    word.case === "Nominativ" && "bg-red-400",
                    word.case === "Akkusativ" && "bg-blue-400",
                    word.case === "Dativ" && "bg-green-400",
                    word.case === "Genitiv" && "bg-purple-400"
                  )}
                />
                <span className="text-sm font-semibold text-gray-800">{word.case}</span>
              </div>
              <p className="text-xs text-gray-500">
                {CASE_EXPLANATIONS[word.case]}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={() => onSaveVocab(word)}
            disabled={isSaved}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
              isSaved
                ? "bg-green-50 text-green-600 border border-green-200 cursor-default"
                : "bg-blue-600 text-white hover:bg-blue-700 active:scale-95"
            )}
          >
            <BookmarkPlus className="w-4 h-4" />
            {isSaved ? "Saved to Vocab Deck ✓" : "Save to Vocab Deck"}
          </button>
        </div>
      </div>
    </div>
  );
}
