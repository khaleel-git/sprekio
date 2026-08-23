"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { getDueCards, getNewCards, getLearnedCards } from "@/lib/srs";
import VocabCardComponent from "@/components/VocabCard";
import { Brain, BookOpen, Layers, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function VocabPage() {
  const { vocabDeck, reviewVocabCard, progress } = useStore();
  const [sessionIndex, setSessionIndex] = useState(0);
  const [mode, setMode] = useState<"due" | "all" | null>(null);
  const [sessionDone, setSessionDone] = useState(false);

  const dueCards = getDueCards(vocabDeck);
  const newCards = getNewCards(vocabDeck);
  const learnedCards = getLearnedCards(vocabDeck);

  const sessionCards = mode === "due" ? dueCards : mode === "all" ? vocabDeck : [];
  const currentCard = sessionCards[sessionIndex];

  const handleReview = (quality: 0 | 1 | 2 | 3 | 4 | 5) => {
    if (!currentCard) return;
    reviewVocabCard(currentCard.id, quality);
    if (sessionIndex + 1 >= sessionCards.length) {
      setSessionDone(true);
    } else {
      setTimeout(() => setSessionIndex((i) => i + 1), 500);
    }
  };

  const startSession = (m: "due" | "all") => {
    setMode(m);
    setSessionIndex(0);
    setSessionDone(false);
  };

  const endSession = () => {
    setMode(null);
    setSessionDone(false);
    setSessionIndex(0);
  };

  // ── Session view ─────────────────────────────────────────────────────────
  if (mode && !sessionDone) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <button onClick={endSession} className="text-sm text-gray-500 hover:text-gray-800">
            ← Exit session
          </button>
          <span className="text-sm text-gray-500">
            {sessionIndex + 1} / {sessionCards.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="bg-gray-100 rounded-full h-2">
          <div
            className="bg-blue-500 rounded-full h-2 transition-all"
            style={{ width: `${(sessionIndex / sessionCards.length) * 100}%` }}
          />
        </div>

        {currentCard ? (
          <VocabCardComponent card={currentCard} onReview={handleReview} />
        ) : (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        )}
      </div>
    );
  }

  // ── Session done ──────────────────────────────────────────────────────────
  if (mode && sessionDone) {
    return (
      <div className="text-center py-16 space-y-4 animate-fade-in">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900">Session Complete!</h2>
        <p className="text-gray-500">
          You reviewed {sessionCards.length} card{sessionCards.length !== 1 ? "s" : ""}
        </p>
        <p className="text-sm text-blue-600 font-medium">+{sessionCards.length * 10} XP earned</p>
        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={endSession}
            className="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
          >
            Back to Vocab
          </button>
        </div>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  if (vocabDeck.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <div className="text-5xl">📚</div>
        <h2 className="text-xl font-bold text-gray-900">Your vocab deck is empty</h2>
        <p className="text-gray-500 text-sm max-w-xs mx-auto">
          While reading stories, tap any highlighted word and click{" "}
          <span className="font-medium">&quot;Save to Vocab Deck&quot;</span> to add it here.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700"
        >
          <BookOpen className="w-4 h-4" />
          Browse Stories
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-6 h-6" />
          <h1 className="text-xl font-bold">Vocabulary Deck</h1>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{dueCards.length}</div>
            <div className="text-xs text-purple-200">Due today</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{newCards.length}</div>
            <div className="text-xs text-purple-200">New cards</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{learnedCards.length}</div>
            <div className="text-xs text-purple-200">Learned</div>
          </div>
        </div>
      </div>

      {/* Start review buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => startSession("due")}
          disabled={dueCards.length === 0}
          className={cn(
            "flex flex-col items-center gap-2 p-5 rounded-2xl border-2 font-semibold transition-all",
            dueCards.length > 0
              ? "border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-100 active:scale-95"
              : "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
          )}
        >
          <Layers className="w-6 h-6" />
          <span className="text-sm">Review Due</span>
          <span className="text-xs font-normal text-orange-500">{dueCards.length} cards</span>
        </button>
        <button
          onClick={() => startSession("all")}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-95 font-semibold transition-all"
        >
          <Brain className="w-6 h-6" />
          <span className="text-sm">Review All</span>
          <span className="text-xs font-normal text-blue-500">{vocabDeck.length} cards</span>
        </button>
      </div>

      {/* Card list */}
      <div>
        <h2 className="font-bold text-gray-900 mb-3">All cards ({vocabDeck.length})</h2>
        <div className="space-y-2">
          {vocabDeck.map((card) => {
            const isDue = getDueCards([card]).length > 0;
            return (
              <div
                key={card.id}
                className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm"
              >
                <div>
                  <span className="font-medium text-gray-900">{card.word}</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-sm text-blue-600">{card.translation}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{card.repetitions} reviews</span>
                  {isDue ? (
                    <span className="w-2 h-2 rounded-full bg-orange-400" title="Due for review" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
