export interface CandidateSense {
  senseId: string;
  lemmaId: string;
  gloss: string;
  frequency?: number;
  partOfSpeech?: string;
}

export interface LexicalResult {
  surface: string;
  normalized: string;
  lemma: {
    id: string;
    text: string;
    partOfSpeech?: string;
    gender?: string;
  };
  senses: CandidateSense[];
}

export interface RankingEvidence {
  rule: string;
  category: "phrase" | "morphology" | "pos" | "syntax" | "context" | "frequency";
  weight: number;
  matched: boolean;
  explanation?: string;
}

export interface RankedSense {
  sense: CandidateSense;
  score: number;
  evidence: RankingEvidence[];
}

export interface RankingResult {
  candidates: RankedSense[];
  selected?: RankedSense;
  decision: "deterministic" | "needs_ai";
}

export interface PhraseEntry {
  id: string;
  lemma: string;
  type: "phrase" | "separable_verb" | "collocation";
  base?: string;
  particle?: string;
  pattern: string[];
  translation: string[];
  triggers?: string[];
  priority: number;
  constraints?: {
    particleMustBeClauseFinal?: boolean;
    particleCannotBeClauseFinal?: boolean;
    particleCannotBePreposition?: boolean;
    particleCannotBeDeterminer?: boolean;
  };
}

export interface PhraseMatch {
  entryId: string;
  lemma: string;
  type: "phrase" | "separable_verb" | "collocation";
  matchedTokens: string[];
  translation: string[];
  startIndex: number;
  endIndex: number;
  score: number;
}
