"use client";

import { useState } from "react";
import { Story, WordAnnotation, CASE_COLORS } from "@/lib/stories";
import { useStore } from "@/lib/store";
import GrammarPopup from "./GrammarPopup";
import AudioPlayer from "./AudioPlayer";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

interface StoryReaderProps {
  story: Story;
}

export default function StoryReader({ story }: StoryReaderProps) {
  const [selectedWord, setSelectedWord] = useState<WordAnnotation | null>(null);
  const [showTranslations, setShowTranslations] = useState<Set<string>>(new Set());
  const [showGrammarColors, setShowGrammarColors] = useState(true);
  const [playingState, setPlayingState] = useState<{ paragraphIndex: number; charIndex: number; charLength: number } | null>(null);
  const { vocabDeck, addWordToDeck } = useStore();

  const allTexts = story.paragraphs.map((p) => p.text);

  const toggleTranslation = (paragraphId: string) => {
    setShowTranslations((prev) => {
      const next = new Set(prev);
      if (next.has(paragraphId)) next.delete(paragraphId);
      else next.add(paragraphId);
      return next;
    });
  };

  const handleWordClick = (word: WordAnnotation) => {
    setSelectedWord(word);
  };

  const handleSaveVocab = (word: WordAnnotation) => {
    addWordToDeck(word.word, word.translation, story.id, story.title, undefined);
  };

  const isWordSaved = (word: string) =>
    vocabDeck.some((c) => c.word === word && c.storyId === story.id);

  return (
    <div className="space-y-4">
      {/* Audio Player */}
      <AudioPlayer 
        paragraphs={allTexts} 
        onProgress={(pIndex, cIndex, cLen) => {
          if (pIndex === -1) setPlayingState(null);
          else setPlayingState({ paragraphIndex: pIndex, charIndex: cIndex, charLength: cLen });
        }}
      />

      {/* Grammar color toggle */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-red-400 rounded" />
            <span className="text-gray-500">Nominativ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-blue-400 rounded" />
            <span className="text-gray-500">Akkusativ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-green-400 rounded" />
            <span className="text-gray-500">Dativ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-purple-400 rounded" />
            <span className="text-gray-500">Genitiv</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-yellow-400 rounded border-dashed" style={{borderBottom: '2px dashed'}} />
            <span className="text-gray-500">Separable verb</span>
          </div>
        </div>
        <button
          onClick={() => setShowGrammarColors(!showGrammarColors)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        >
          {showGrammarColors ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {showGrammarColors ? "Hide" : "Show"} grammar
        </button>
      </div>

      {/* Paragraphs */}
      {story.paragraphs.map((paragraph, pIndex) => (
        <div key={paragraph.id} className={cn("bg-white rounded-2xl border p-5 shadow-sm transition-colors", playingState?.paragraphIndex === pIndex ? "border-blue-300 ring-2 ring-blue-100" : "border-gray-100")}>
          {/* German text with clickable words */}
          <div className="text-gray-900 leading-relaxed text-base mb-3">
            <AnnotatedText
              text={paragraph.text}
              words={paragraph.words}
              onWordClick={handleWordClick}
              showGrammarColors={showGrammarColors}
              savedWords={vocabDeck.map((c) => c.word)}
              playingCharInfo={playingState?.paragraphIndex === pIndex ? { index: playingState.charIndex, length: playingState.charLength } : null}
            />
          </div>

          {/* Translation toggle */}
          <button
            onClick={() => toggleTranslation(paragraph.id)}
            className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 transition-colors"
          >
            {showTranslations.has(paragraph.id) ? (
              <>
                <EyeOff className="w-3.5 h-3.5" /> Hide translation
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" /> Show translation
              </>
            )}
          </button>

          {showTranslations.has(paragraph.id) && (
            <p className="mt-2 text-sm text-gray-500 italic border-l-2 border-blue-200 pl-3 animate-fade-in">
              {paragraph.translation}
            </p>
          )}
        </div>
      ))}

      {/* Word popup */}
      {selectedWord && (
        <GrammarPopup
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
          onSaveVocab={handleSaveVocab}
          isSaved={isWordSaved(selectedWord.word)}
        />
      )}
    </div>
  );
}

// ── Annotated text component ─────────────────────────────────────────────────
function AnnotatedText({
  text,
  words,
  onWordClick,
  showGrammarColors,
  savedWords,
  playingCharInfo,
}: {
  text: string;
  words: WordAnnotation[];
  onWordClick: (word: WordAnnotation) => void;
  showGrammarColors: boolean;
  savedWords: string[];
  playingCharInfo: { index: number; length: number } | null;
}) {
  const wordMap = new Map<string, WordAnnotation>();
  words.forEach((w) => wordMap.set(w.word.toLowerCase(), w));

  const tokens = text.split(/(\s+|[.,!?;:\"'„"—–()[\]])/);
  let currentGlobalCharIndex = 0;

  return (
    <>
      {tokens.map((token, i) => {
        const tokenStartIndex = currentGlobalCharIndex;
        currentGlobalCharIndex += token.length;

        const isPlaying =
          playingCharInfo &&
          tokenStartIndex >= playingCharInfo.index &&
          tokenStartIndex < playingCharInfo.index + playingCharInfo.length;

        const basePlayClass = isPlaying ? "bg-blue-600 text-white rounded px-0.5 shadow-sm" : "";

        if (!token.trim() || /^[.,!?;:\"'„"—–()[\]]+$/.test(token)) {
          return <span key={i} className={basePlayClass}>{token}</span>;
        }

        const clean = token.replace(/[.,!?;:\"'„"—–()[\]]/g, "").toLowerCase();
        const annotation = wordMap.get(clean);

        if (!annotation || !showGrammarColors) {
          return (
            <span
              key={i}
              onClick={() => annotation && onWordClick(annotation)}
              className={cn(
                basePlayClass,
                !isPlaying && annotation ? "cursor-pointer bg-yellow-100/60 hover:bg-yellow-200 border-b-2 border-yellow-200/50 rounded px-0.5 font-medium transition-colors" : ""
              )}
            >
              {token}
            </span>
          );
        }

        const caseClass = annotation.case ? CASE_COLORS[annotation.case] || "" : "";
        const isSaved = savedWords.includes(annotation.word);

        return (
          <span
            key={i}
            onClick={() => onWordClick(annotation)}
            className={cn(
              isPlaying ? "bg-blue-600 text-white rounded px-0.5 shadow-sm font-bold" : "cursor-pointer bg-yellow-100/60 hover:bg-yellow-200 border-b-2 border-yellow-200/50 rounded px-0.5 font-medium transition-colors",
              !isPlaying && caseClass,
              !isPlaying && annotation.separable && "decoration-dashed underline decoration-yellow-400",
              !isPlaying && isSaved && "bg-green-50 border-green-200/50"
            )}
            title={`${annotation.translation}${annotation.case ? ` - ${annotation.case}` : ""}`}
          >
            {token}
          </span>
        );
      })}
    </>
  );
}
