// SM-2 Spaced Repetition Algorithm
// Based on: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2

export interface VocabCard {
  id: string;
  word: string;
  translation: string;
  example?: string;
  // Only used for display in the locally-stored (guest) deck — the scheduling functions
  // below never read them, so a Firestore-backed vocab word (identified by video, not
  // story) can reuse this same interface without needing placeholder values.
  storyId?: string;
  storyTitle?: string;
  // SM-2 fields
  easeFactor: number;       // default 2.5
  interval: number;         // days until next review
  repetitions: number;      // number of correct reviews
  dueDate: string;          // ISO date string
  lastReviewed?: string;
}

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;
// 0 = complete blackout
// 1 = wrong, but correct answer easy to recall
// 2 = wrong, but correct answer seemed easy
// 3 = correct, with serious difficulty
// 4 = correct, with some hesitation
// 5 = perfect response

export function createCard(
  word: string,
  translation: string,
  storyId: string,
  storyTitle: string,
  example?: string
): VocabCard {
  return {
    id: `${storyId}-${word}-${Date.now()}`,
    word,
    translation,
    example,
    storyId,
    storyTitle,
    easeFactor: 2.5,
    interval: 1,
    repetitions: 0,
    dueDate: new Date().toISOString(),
  };
}

export function reviewCard(card: VocabCard, quality: ReviewQuality): VocabCard {
  let { easeFactor, interval, repetitions } = card;

  if (quality >= 3) {
    // Correct response
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    // Incorrect response - reset
    repetitions = 0;
    interval = 1;
  }

  // Update ease factor
  easeFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + interval);

  return {
    ...card,
    easeFactor,
    interval,
    repetitions,
    dueDate: dueDate.toISOString(),
    lastReviewed: new Date().toISOString(),
  };
}

export function isDue(card: VocabCard): boolean {
  return new Date(card.dueDate) <= new Date();
}

export function getDueCards(cards: VocabCard[]): VocabCard[] {
  return cards.filter(isDue);
}

export function getNewCards(cards: VocabCard[]): VocabCard[] {
  return cards.filter((c) => c.repetitions === 0);
}

export function getLearnedCards(cards: VocabCard[]): VocabCard[] {
  return cards.filter((c) => c.repetitions > 0 && !isDue(c));
}
