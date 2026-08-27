"use client";

import { collection, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db, getVocabularyWords } from "./firebase";
import { VocabCard, ReviewQuality, reviewCard } from "./srs";

/**
 * A word saved by the Chrome extension (users/{uid}/vocabulary), extended with the SM-2
 * scheduling fields the local-only /vocab deck already used. This is the single vocab
 * model for logged-in users — the extension and the website read/write the same
 * Firestore documents, just adding fields the other side doesn't need to know about.
 */
export interface FirestoreVocabWord extends VocabCard {
  lemma?: string;
  partOfSpeech?: string;
  gender?: string;
  case?: string;
  contextSentence?: string;
  videoId?: string;
  videoTitle?: string;
  status?: "new" | "learning" | "learned";
  saveCount?: number;
  /** Raw Firestore Timestamp ({ seconds, nanoseconds }) — not converted to a string here. */
  savedAt?: { seconds: number; nanoseconds: number };
}

// Words saved before this SRS unification (or saved directly by the extension, which
// doesn't know about spaced repetition) won't have these fields yet. Default them at
// read time instead of running a batch migration, so old and new docs both just work.
function withSrsDefaults(raw: Record<string, unknown>): FirestoreVocabWord {
  return {
    id: raw.id as string,
    word: (raw.word as string) || "",
    translation: (raw.translation as string) || "",
    lemma: raw.lemma as string | undefined,
    partOfSpeech: raw.partOfSpeech as string | undefined,
    gender: raw.gender as string | undefined,
    case: raw.case as string | undefined,
    contextSentence: raw.contextSentence as string | undefined,
    videoId: raw.videoId as string | undefined,
    videoTitle: raw.videoTitle as string | undefined,
    status: (raw.status as FirestoreVocabWord["status"]) || "new",
    saveCount: raw.saveCount as number | undefined,
    savedAt: raw.savedAt as FirestoreVocabWord["savedAt"],
    easeFactor: (raw.easeFactor as number) ?? 2.5,
    interval: (raw.interval as number) ?? 1,
    repetitions: (raw.repetitions as number) ?? 0,
    dueDate: (raw.dueDate as string) ?? new Date().toISOString(),
    lastReviewed: raw.lastReviewed as string | undefined,
  };
}

export async function fetchVocabWords(uid: string): Promise<FirestoreVocabWord[]> {
  const res = await getVocabularyWords(uid);
  if (!res.success) return [];
  return (res.words as Record<string, unknown>[]).map(withSrsDefaults);
}

export async function reviewVocabWord(
  uid: string,
  word: FirestoreVocabWord,
  quality: ReviewQuality
): Promise<FirestoreVocabWord> {
  const updated = reviewCard(word, quality);
  const ref = doc(db, "users", uid, "vocabulary", word.id);
  await updateDoc(ref, {
    easeFactor: updated.easeFactor,
    interval: updated.interval,
    repetitions: updated.repetitions,
    dueDate: updated.dueDate,
    lastReviewed: updated.lastReviewed,
  });
  return updated as FirestoreVocabWord;
}

/**
 * One-time import of a guest's local SM-2 deck into their Firestore vocabulary once
 * they sign in, so switching to an account never silently discards prior progress.
 * Dedupes by word (case-insensitive) against what's already in Firestore.
 */
export async function mergeLocalDeckIntoFirestore(
  uid: string,
  localDeck: VocabCard[]
): Promise<number> {
  if (localDeck.length === 0) return 0;
  const existing = await fetchVocabWords(uid);
  const existingWords = new Set(existing.map((w) => w.word.toLowerCase()));
  const vocabRef = collection(db, "users", uid, "vocabulary");

  let imported = 0;
  for (const card of localDeck) {
    if (existingWords.has(card.word.toLowerCase())) continue;
    await addDoc(vocabRef, {
      word: card.word,
      lemma: card.word,
      translation: card.translation,
      contextSentence: card.example || "",
      status: card.repetitions > 0 ? "learning" : "new",
      saveCount: 1,
      savedAt: serverTimestamp(),
      easeFactor: card.easeFactor,
      interval: card.interval,
      repetitions: card.repetitions,
      dueDate: card.dueDate,
      lastReviewed: card.lastReviewed || null,
    });
    imported++;
  }
  return imported;
}
