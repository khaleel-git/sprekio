"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import { useStore } from "@/lib/store";
import { fetchVocabWords, reviewVocabWord, FirestoreVocabWord } from "@/lib/vocab";
import { getOrCreateProfile, addXp, CloudProgress } from "@/lib/profile";
import { getDueCards, getNewCards, getLearnedCards, VocabCard as VocabCardType, ReviewQuality } from "@/lib/srs";
import { deleteVocabularyWord } from "@/lib/firebase";
import VocabCardComponent from "@/components/VocabCard";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Brain, Layers, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function VocabPage() {
  const { user, loading: authLoading } = useAuth();
  const { vocabDeck, reviewVocabCard, removeVocabCard } = useStore();

  const [cloudWords, setCloudWords] = useState<FirestoreVocabWord[]>([]);
  const [cloudProfile, setCloudProfile] = useState<CloudProgress | null>(null);
  const [cloudLoading, setCloudLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setCloudLoading(false);
      return;
    }
    setCloudLoading(true);
    Promise.all([fetchVocabWords(user.uid), getOrCreateProfile(user.uid)]).then(([words, profile]) => {
      setCloudWords(words);
      setCloudProfile(profile);
      setCloudLoading(false);
    });
  }, [user]);

  const deck: VocabCardType[] = user ? cloudWords : vocabDeck;

  const [sessionIndex, setSessionIndex] = useState(0);
  const [mode, setMode] = useState<"due" | "all" | null>(null);
  const [sessionDone, setSessionDone] = useState(false);

  const dueCards = getDueCards(deck);
  const newCards = getNewCards(deck);
  const learnedCards = getLearnedCards(deck);

  const sessionCards = mode === "due" ? dueCards : mode === "all" ? deck : [];
  const currentCard = sessionCards[sessionIndex];

  const handleReview = async (quality: ReviewQuality) => {
    if (!currentCard) return;

    if (user) {
      const updated = await reviewVocabWord(user.uid, currentCard as FirestoreVocabWord, quality);
      setCloudWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      if (cloudProfile) {
        const updatedProfile = await addXp(user.uid, cloudProfile, 10);
        setCloudProfile(updatedProfile);
      }
    } else {
      reviewVocabCard(currentCard.id, quality);
    }

    if (sessionIndex + 1 >= sessionCards.length) setSessionDone(true);
    else setTimeout(() => setSessionIndex((i) => i + 1), 500);
  };

  const handleRemove = async (card: VocabCardType) => {
    if (user) {
      await deleteVocabularyWord(user.uid, card.id);
      setCloudWords((prev) => prev.filter((w) => w.id !== card.id));
    } else {
      removeVocabCard(card.id);
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

  if (authLoading || cloudLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  // ── Session view ─────────────────────────────────────────────────────────
  if (mode && !sessionDone) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <button onClick={endSession} className="text-sm text-ink/50 hover:text-ink">
            ← Exit session
          </button>
          <span className="text-sm text-ink/50">
            {sessionIndex + 1} / {sessionCards.length}
          </span>
        </div>

        <div className="bg-black/5 rounded-full h-2">
          <div
            className="bg-brand rounded-full h-2 transition-all"
            style={{ width: `${(sessionIndex / sessionCards.length) * 100}%` }}
          />
        </div>

        {currentCard ? (
          <VocabCardComponent
            card={currentCard}
            onReview={handleReview}
            onRemove={() => handleRemove(currentCard)}
            sourceLabel={currentCard.storyTitle || (currentCard as FirestoreVocabWord).videoTitle}
          />
        ) : (
          <div className="text-center py-12 text-ink/30">Loading...</div>
        )}
      </div>
    );
  }

  // ── Session done ──────────────────────────────────────────────────────────
  if (mode && sessionDone) {
    return (
      <div className="text-center py-16 space-y-4 animate-fade-in">
        <div className="text-6xl">🎉</div>
        <h2 className="font-display text-2xl font-semibold text-ink">Session Complete!</h2>
        <p className="text-ink/50">
          You reviewed {sessionCards.length} card{sessionCards.length !== 1 ? "s" : ""}
        </p>
        <p className="text-sm text-brand font-semibold">+{sessionCards.length * 10} XP earned</p>
        <button
          onClick={endSession}
          className="px-6 py-3 rounded-xl bg-brand text-white font-semibold hover:bg-brand-dark mt-2"
        >
          Back to Vocab
        </button>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (deck.length === 0) {
    return (
      <EmptyState
        icon={Brain}
        title="Your vocab deck is empty"
        description={
          user
            ? "Save words while watching YouTube with the Sprekio extension and they'll show up here for review."
            : "While reading stories, tap any highlighted word and save it to your deck to add it here."
        }
        action={{ label: "Browse Stories", href: "/" }}
      />
    );
  }

  // ── Overview ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink flex items-center gap-2">
          <Brain className="w-6 h-6 text-brand" />
          Vocabulary Review
        </h1>
        <p className="text-ink/50 text-sm mt-1">
          {user ? "Synced with your saved words from the extension." : "Stored locally on this device — sign in to sync across devices."}
        </p>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-brand-light rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-brand-dark">{dueCards.length}</div>
            <div className="text-xs text-brand-dark/60">Due today</div>
          </div>
          <div className="bg-black/[0.03] rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-ink">{newCards.length}</div>
            <div className="text-xs text-ink/40">New cards</div>
          </div>
          <div className="bg-black/[0.03] rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-ink">{learnedCards.length}</div>
            <div className="text-xs text-ink/40">Learned</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => startSession("due")}
          disabled={dueCards.length === 0}
          className={cn(
            "flex flex-col items-center gap-2 p-5 rounded-2xl border-2 font-semibold transition-all",
            dueCards.length > 0
              ? "border-brand/40 bg-brand-light text-brand-dark hover:bg-brand/10 active:scale-95"
              : "border-black/5 bg-black/[0.02] text-ink/25 cursor-not-allowed"
          )}
        >
          <Layers className="w-6 h-6" />
          <span className="text-sm">Review Due</span>
          <span className="text-xs font-normal opacity-70">{dueCards.length} cards</span>
        </button>
        <button
          onClick={() => startSession("all")}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-ink/15 bg-black/[0.02] text-ink hover:bg-black/5 active:scale-95 font-semibold transition-all"
        >
          <Brain className="w-6 h-6" />
          <span className="text-sm">Review All</span>
          <span className="text-xs font-normal opacity-60">{deck.length} cards</span>
        </button>
      </div>

      <div>
        <h2 className="font-bold text-ink mb-3">All cards ({deck.length})</h2>
        <div className="space-y-2">
          {deck.map((card) => {
            const isDue = getDueCards([card]).length > 0;
            return (
              <div
                key={card.id}
                className="bg-surface-card rounded-xl border border-black/5 px-4 py-3 flex items-center justify-between shadow-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-ink">{card.word}</span>
                  <span className="text-ink/25 mx-2">·</span>
                  <span className="text-sm text-brand-dark">{card.translation}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-ink/35">{card.repetitions} reviews</span>
                  {isDue ? (
                    <span className="w-2 h-2 rounded-full bg-brand" title="Due for review" />
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
