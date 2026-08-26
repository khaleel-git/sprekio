import { PhraseEntry, PhraseMatch, LexicalResult } from './types';
import phraseData from './phrases.json';

const phrases: PhraseEntry[] = phraseData as PhraseEntry[];

const REFLEXIVE_PRONOUNS = ['mich', 'dich', 'sich', 'uns', 'euch'];

export class PhraseDetector {
  /**
   * Tokenizes a sentence into lowercase words and punctuation separately.
   */
  private tokenize(sentence: string): string[] {
    const matches = sentence.toLowerCase().match(/[\wäöüß]+|[.,!?]/g);
    return matches || [];
  }

  public detect(lexical: LexicalResult, contextSentence: string): PhraseMatch | null {
    if (!contextSentence) return null;

    const tokens = this.tokenize(contextSentence);
    const lemmaStr = lexical.lemma.text.toLowerCase();

    const candidates = phrases.filter(p => {
      if (p.type === 'separable_verb') {
        return p.base?.toLowerCase() === lemmaStr || 
               p.particle?.toLowerCase() === lemmaStr || 
               p.pattern[0].toLowerCase() === lemmaStr || 
               p.pattern[1].toLowerCase() === lemmaStr;
      }
      return p.pattern.some(token => token.toLowerCase() === lemmaStr);
    });

    candidates.sort((a, b) => b.priority - a.priority);

    for (const phrase of candidates) {
      const match = this.evaluatePattern(phrase, tokens, lexical.normalized, lemmaStr);
      if (match) {
        return match;
      }
    }

    return null;
  }

  private evaluatePattern(phrase: PhraseEntry, tokens: string[], surfaceWord: string, lemmaStr: string): PhraseMatch | null {
    let matchedTokens: string[] = [];
    let allTokensFound = true;
    
    const verbConjugations: Record<string, string[]> = {
      'haben': ['habe', 'hast', 'hat', 'haben', 'habt', 'hatte', 'hattest', 'hatten', 'hattet'],
      'sein': ['bin', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart'],
      'werden': ['werde', 'wirst', 'wird', 'werden', 'werdet', 'wurde', 'wurden']
    };

    // For checking constraints later
    let particleIndex = -1;

    for (const pToken of phrase.pattern) {
      const p = pToken.toLowerCase();

      if (p === 'sich') {
        const foundReflexive = tokens.find(t => REFLEXIVE_PRONOUNS.includes(t));
        if (foundReflexive) {
          matchedTokens.push(foundReflexive);
        } else {
          allTokensFound = false;
          break;
        }
      } else if (p === lemmaStr || p === phrase.base?.toLowerCase()) {
        if (tokens.includes(surfaceWord)) {
          matchedTokens.push(surfaceWord);
        } else {
           matchedTokens.push(surfaceWord);
        }
      } else {
        const pIndex = tokens.indexOf(p);
        if (pIndex !== -1) {
          matchedTokens.push(p);
          if (p === phrase.particle?.toLowerCase()) {
            particleIndex = pIndex;
          }
        } else if (verbConjugations[p] && tokens.some(t => verbConjugations[p].includes(t))) {
          const found = tokens.find(t => verbConjugations[p].includes(t))!;
          matchedTokens.push(found);
        } else {
          allTokensFound = false;
          break;
        }
      }
    }

    if (allTokensFound) {
      // Evaluate structural constraints
      if (phrase.constraints && particleIndex !== -1) {
        const nextToken = particleIndex + 1 < tokens.length ? tokens[particleIndex + 1] : null;
        const clauseEndings = ['.', ',', '!', '?', 'und', 'oder', 'aber'];
        const isClauseFinal = !nextToken || clauseEndings.includes(nextToken);
        
        if (phrase.constraints.particleMustBeClauseFinal && !isClauseFinal) {
           return null;
        }

        if (phrase.constraints.particleCannotBeClauseFinal && isClauseFinal) {
           return null;
        }

        if (phrase.constraints.particleCannotBePreposition) {
           const articlesAndPronouns = ['der', 'die', 'das', 'dem', 'den', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'mich', 'dich', 'sich', 'uns', 'euch', 'ihn', 'ihr', 'ihnen', 'mir', 'dir'];
           if (nextToken && articlesAndPronouns.includes(nextToken)) {
              return null; // Constraint failed (it's acting as a preposition)
           }
        }

        if (phrase.constraints.particleCannotBeDeterminer) {
           // If it's not at the end, it's acting as an article/determiner for a noun
           if (!isClauseFinal) {
              return null;
           }
        }
      }

      let startIndex = 9999;
      let endIndex = -1;
      
      matchedTokens.forEach(mt => {
        const idx = tokens.indexOf(mt);
        if (idx !== -1) {
          startIndex = Math.min(startIndex, idx);
          endIndex = Math.max(endIndex, idx);
        }
      });

      return {
        entryId: phrase.id,
        lemma: phrase.lemma,
        type: phrase.type,
        matchedTokens,
        translation: phrase.translation,
        startIndex: startIndex === 9999 ? 0 : startIndex,
        endIndex: endIndex === -1 ? 0 : endIndex,
        score: phrase.priority
      };
    }

    return null;
  }
}
