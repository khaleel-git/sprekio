import storiesData from "@/data/stories.json";

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type Dialect = "Bayerisch" | "Österreichisch" | "Schweizerdeutsch" | null;

export interface WordAnnotation {
  word: string;
  translation: string;
  type: string;
  case?: string;
  gender?: string;
  separable?: boolean;
  base?: string;
}

export interface Paragraph {
  id: string;
  text: string;
  translation: string;
  words: WordAnnotation[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

export interface Story {
  id: string;
  title: string;
  titleEn: string;
  level: CEFRLevel;
  topic: string;
  dialect: Dialect;
  duration: number;        // minutes
  imageEmoji: string;
  color: string;           // tailwind gradient class
  description: string;
  descriptionEn: string;
  upvotes: number;
  isPublic: boolean;
  paragraphs: Paragraph[];
  vocabulary: { word: string; translation: string; example: string }[];
  grammarFocus: string;
  quiz: QuizQuestion[];
}

export const stories: Story[] = storiesData as Story[];

export function getStoryById(id: string): Story | undefined {
  return stories.find((s) => s.id === id);
}

export function getStoriesByLevel(level: CEFRLevel): Story[] {
  return stories.filter((s) => s.level === level);
}

export function getStoriesByTopic(topic: string): Story[] {
  return stories.filter((s) => s.topic.toLowerCase() === topic.toLowerCase());
}

export function getDialectStories(): Story[] {
  return stories.filter((s) => s.dialect !== null);
}

export const CEFR_LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const CEFR_COLORS: Record<CEFRLevel, string> = {
  A1: "bg-green-100 text-green-800 border-green-200",
  A2: "bg-emerald-100 text-emerald-800 border-emerald-200",
  B1: "bg-blue-100 text-blue-800 border-blue-200",
  B2: "bg-indigo-100 text-indigo-800 border-indigo-200",
  C1: "bg-purple-100 text-purple-800 border-purple-200",
  C2: "bg-rose-100 text-rose-800 border-rose-200",
};

// Story-card header gradients, keyed by CEFR level rather than a per-story random color —
// so scanning the grid tells a learner something real (easy → hard) instead of decoration.
export const CEFR_GRADIENTS: Record<CEFRLevel, string> = {
  A1: "from-green-400 to-emerald-500",
  A2: "from-emerald-500 to-teal-600",
  B1: "from-teal-500 to-blue-600",
  B2: "from-blue-600 to-indigo-700",
  C1: "from-indigo-600 to-purple-700",
  C2: "from-purple-700 to-rose-700",
};

export const CEFR_DESCRIPTIONS: Record<CEFRLevel, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Mastery",
};

export const WORD_TYPE_COLORS: Record<string, string> = {
  noun: "text-blue-700",
  verb: "text-green-700",
  adjective: "text-orange-700",
  adverb: "text-purple-700",
  preposition: "text-gray-600",
  conjunction: "text-gray-600",
  pronoun: "text-pink-700",
  article: "text-gray-500",
  phrase: "text-teal-700",
};

export const CASE_COLORS: Record<string, string> = {
  Nominativ: "border-b-2 border-red-400",
  Akkusativ: "border-b-2 border-blue-400",
  Dativ: "border-b-2 border-green-400",
  Genitiv: "border-b-2 border-purple-400",
};

export const XP_PER_STORY: Record<CEFRLevel, number> = {
  A1: 30,
  A2: 40,
  B1: 55,
  B2: 70,
  C1: 90,
  C2: 120,
};
