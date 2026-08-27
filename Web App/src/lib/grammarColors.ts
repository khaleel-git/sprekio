// Part-of-speech color mapping, kept in exact sync with the Chrome extension's
// POS_COLORS (Chrome Extension/src/content/index.tsx) so a word's grammar color means
// the same thing whether you're looking at it in the extension popup or on the website.
export const POS_HEX: Record<string, string> = {
  noun: "#3b82f6",
  verb: "#ef4444",
  adj: "#22c55e",
  adv: "#a855f7",
  pron: "#14b8a6",
  prep: "#ec4899",
  conj: "#64748b",
  det: "#06b6d4",
  num: "#6366f1",
  intj: "#84cc16",
  phrase: "#78716c",
};

export const POS_LABELS: Record<string, string> = {
  noun: "Noun",
  verb: "Verb",
  adj: "Adjective",
  adv: "Adverb",
  pron: "Pronoun",
  prep: "Preposition",
  conj: "Conjunction",
  det: "Article / Determiner",
  num: "Number",
  intj: "Interjection",
  phrase: "Phrase",
};

// The website's story data labels part-of-speech with full words ("adjective") rather
// than the extension's short codes ("adj") — normalize before looking up POS_HEX/LABELS.
const WORD_TYPE_TO_POS: Record<string, string> = {
  noun: "noun",
  verb: "verb",
  adjective: "adj",
  adverb: "adv",
  pronoun: "pron",
  preposition: "prep",
  conjunction: "conj",
  article: "det",
  determiner: "det",
  number: "num",
  interjection: "intj",
  phrase: "phrase",
};

export function posHexForWordType(wordType: string): string | undefined {
  return POS_HEX[WORD_TYPE_TO_POS[wordType.toLowerCase()] ?? wordType.toLowerCase()];
}

export function posLabelForWordType(wordType: string): string {
  const code = WORD_TYPE_TO_POS[wordType.toLowerCase()] ?? wordType.toLowerCase();
  return POS_LABELS[code] ?? wordType;
}
