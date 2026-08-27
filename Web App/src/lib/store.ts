"use client";

import { create } from "zustand";
import { VocabCard, reviewCard, ReviewQuality, createCard } from "./srs";

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserProgress {
  completedStories: string[];           // story IDs
  xp: number;
  streak: number;
  lastActiveDate: string | null;        // ISO date
  level: number;                        // 1–10
  upvotedStories: string[];
}

interface AppStore {
  // User progress
  progress: UserProgress;
  vocabDeck: VocabCard[];

  // Actions
  completeStory: (storyId: string, xpEarned: number) => void;
  addWordToDeck: (word: string, translation: string, storyId: string, storyTitle: string, example?: string) => void;
  reviewVocabCard: (cardId: string, quality: ReviewQuality) => void;
  removeVocabCard: (cardId: string) => void;
  upvoteStory: (storyId: string) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

// ── XP thresholds per level ──────────────────────────────────────────────────
export const LEVEL_THRESHOLDS = [0, 100, 250, 500, 800, 1200, 1800, 2600, 3600, 5000, 7000];
export const LEVEL_NAMES = [
  "Anfänger",        // 1
  "Lernender",       // 2
  "Fortgeschrittener",// 3
  "Kenner",          // 4
  "Geübter",         // 5
  "Erfahrener",      // 6
  "Experte",         // 7
  "Meister",         // 8
  "Großmeister",     // 9
  "Polyglott",       // 10
];

export function getLevelFromXP(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

// Generic over just the fields it touches so the Firestore-backed CloudProgress shape
// (src/lib/profile.ts) can reuse this too.
export function checkStreak<T extends { streak: number; lastActiveDate: string | null }>(progress: T): T {
  const today = new Date().toDateString();
  const last = progress.lastActiveDate ? new Date(progress.lastActiveDate).toDateString() : null;
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  if (last === today) {
    return progress; // already active today
  } else if (last === yesterday) {
    return { ...progress, streak: progress.streak + 1, lastActiveDate: new Date().toISOString() };
  } else {
    return { ...progress, streak: 1, lastActiveDate: new Date().toISOString() };
  }
}

// ── Default state ─────────────────────────────────────────────────────────────
const DEFAULT_PROGRESS: UserProgress = {
  completedStories: [],
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  level: 1,
  upvotedStories: [],
};

// ── Store ─────────────────────────────────────────────────────────────────────
export const useStore = create<AppStore>((set, get) => ({
  progress: DEFAULT_PROGRESS,
  vocabDeck: [],

  loadFromStorage: () => {
    if (typeof window === "undefined") return;
    try {
      const savedProgress = localStorage.getItem("dl_progress");
      const savedDeck = localStorage.getItem("dl_vocab_deck");
      if (savedProgress) {
        set({ progress: JSON.parse(savedProgress) });
      }
      if (savedDeck) {
        set({ vocabDeck: JSON.parse(savedDeck) });
      }
    } catch (e) {
      console.warn("Failed to load from localStorage", e);
    }
  },

  saveToStorage: () => {
    if (typeof window === "undefined") return;
    const { progress, vocabDeck } = get();
    localStorage.setItem("dl_progress", JSON.stringify(progress));
    localStorage.setItem("dl_vocab_deck", JSON.stringify(vocabDeck));
  },

  completeStory: (storyId, xpEarned) => {
    set((state) => {
      const alreadyDone = state.progress.completedStories.includes(storyId);
      const xpGain = alreadyDone ? Math.floor(xpEarned / 3) : xpEarned;
      const newXP = state.progress.xp + xpGain;
      const updated = checkStreak({
        ...state.progress,
        completedStories: alreadyDone
          ? state.progress.completedStories
          : [...state.progress.completedStories, storyId],
        xp: newXP,
        level: getLevelFromXP(newXP),
      });
      return { progress: updated };
    });
    get().saveToStorage();
  },

  addWordToDeck: (word, translation, storyId, storyTitle, example) => {
    set((state) => {
      const exists = state.vocabDeck.some(
        (c) => c.word === word && c.storyId === storyId
      );
      if (exists) return state;
      const newCard = createCard(word, translation, storyId, storyTitle, example);
      return { vocabDeck: [...state.vocabDeck, newCard] };
    });
    // XP for saving vocab
    set((state) => {
      const newXP = state.progress.xp + 5;
      return {
        progress: { ...state.progress, xp: newXP, level: getLevelFromXP(newXP) },
      };
    });
    get().saveToStorage();
  },

  reviewVocabCard: (cardId, quality) => {
    set((state) => {
      const updated = state.vocabDeck.map((card) =>
        card.id === cardId ? reviewCard(card, quality) : card
      );
      return { vocabDeck: updated };
    });
    // XP for review
    set((state) => {
      const newXP = state.progress.xp + 10;
      return {
        progress: { ...state.progress, xp: newXP, level: getLevelFromXP(newXP) },
      };
    });
    get().saveToStorage();
  },

  removeVocabCard: (cardId) => {
    set((state) => ({
      vocabDeck: state.vocabDeck.filter((c) => c.id !== cardId),
    }));
    get().saveToStorage();
  },

  upvoteStory: (storyId) => {
    set((state) => {
      const already = state.progress.upvotedStories.includes(storyId);
      return {
        progress: {
          ...state.progress,
          upvotedStories: already
            ? state.progress.upvotedStories.filter((id) => id !== storyId)
            : [...state.progress.upvotedStories, storyId],
        },
      };
    });
    get().saveToStorage();
  },
}));
