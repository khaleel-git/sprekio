"use client";

import { useMemo, useState } from "react";
import { Story, WordAnnotation, CASE_COLORS } from "@/lib/stories";
import { useStore } from "@/lib/store";
import { Card } from "./ui/Card";
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
      <AudioPlayer
        paragraphs={allTexts}
        onProgress={(pIndex, cIndex, cLen) => {
          if (pIndex === -1) setPlayingState(null);
          else setPlayingState({ paragraphIndex: pIndex, charIndex: cIndex, charLength: cLen });
        }}
      />

      {/* Grammar color toggle */}
      <div className="flex items-center justify-between text-sm flex-wrap gap-2">
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-red-400 rounded" />
            <span className="text-ink/45">Nominativ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-blue-400 rounded" />
            <span className="text-ink/45">Akkusativ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-green-400 rounded" />
            <span className="text-ink/45">Dativ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-purple-400 rounded" />
            <span className="text-ink/45">Genitiv</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 border-b-2 border-dashed border-amber-400" />
            <span className="text-ink/45">Separable verb</span>
          </div>
        </div>
        <button
          onClick={() => setShowGrammarColors(!showGrammarColors)}
          className="flex items-center gap-1 text-xs text-ink/40 hover:text-ink"
        >
          {showGrammarColors ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {showGrammarColors ? "Hide" : "Show"} grammar
        </button>
      </div>

      {/* Paragraphs */}
      {story.paragraphs.map((paragraph, pIndex) => (
        <Card
          key={paragraph.id}
          className={cn("p-5 transition-colors", playingState?.paragraphIndex === pIndex && "border-brand/40 ring-2 ring-brand/10")}
        >
          <div className="text-ink leading-relaxed text-base mb-3">
            <AnnotatedText
              text={paragraph.text}
              words={paragraph.words}
              onWordClick={handleWordClick}
              showGrammarColors={showGrammarColors}
              savedWords={vocabDeck.map((c) => c.word)}
              playingCharInfo={playingState?.paragraphIndex === pIndex ? { index: playingState.charIndex, length: playingState.charLength } : null}
            />
          </div>

          <button
            onClick={() => toggleTranslation(paragraph.id)}
            className="text-xs text-brand hover:text-brand-dark flex items-center gap-1 transition-colors"
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
            <p className="mt-2 text-sm text-ink/50 italic border-l-2 border-brand/30 pl-3 animate-fade-in">
              {paragraph.translation}
            </p>
          )}
        </Card>
      ))}

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
const SPLIT_RE = /(\s+|[.,!?;:"'„"—–()[\]])/;
const PUNCT_ONLY_RE = /^[.,!?;:"'„"—–()[\]]+$/;

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
  // Precomputed once per text/words change via a reduce (never reassigning an outer
  // variable) so this stays a pure render, unlike the original implementation which
  // mutated a shared char-offset counter while mapping.
  const tokens = useMemo(() => {
    const wordMap = new Map<string, WordAnnotation>();
    words.forEach((w) => wordMap.set(w.word.toLowerCase(), w));

    type Token = { token: string; startIndex: number; annotation?: WordAnnotation };
    return text.split(SPLIT_RE).reduce<Token[]>((acc, token) => {
      const prev = acc[acc.length - 1];
      const startIndex = prev ? prev.startIndex + prev.token.length : 0;
      const clean = token.replace(/[.,!?;:"'„"—–()[\]]/g, "").toLowerCase();
      acc.push({ token, startIndex, annotation: wordMap.get(clean) });
      return acc;
    }, []);
  }, [text, words]);

  return (
    <>
      {tokens.map(({ token, startIndex, annotation }, i) => {
        const isPlaying =
          !!playingCharInfo &&
          startIndex >= playingCharInfo.index &&
          startIndex < playingCharInfo.index + playingCharInfo.length;

        const basePlayClass = isPlaying ? "bg-brand text-white rounded px-0.5 shadow-sm" : "";

        if (!token.trim() || PUNCT_ONLY_RE.test(token)) {
          return <span key={i} className={basePlayClass}>{token}</span>;
        }

        if (!annotation || !showGrammarColors) {
          return (
            <span
              key={i}
              onClick={() => annotation && onWordClick(annotation)}
              className={cn(
                basePlayClass,
                !isPlaying && annotation ? "cursor-pointer bg-brand-light hover:bg-brand/20 border-b-2 border-brand/20 rounded px-0.5 font-medium transition-colors" : ""
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
              isPlaying ? "bg-brand text-white rounded px-0.5 shadow-sm font-bold" : "cursor-pointer bg-brand-light hover:bg-brand/20 border-b-2 border-brand/20 rounded px-0.5 font-medium transition-colors",
              !isPlaying && caseClass,
              !isPlaying && annotation.separable && "decoration-dashed underline decoration-amber-400",
              !isPlaying && isSaved && "bg-green-50 border-green-300"
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
