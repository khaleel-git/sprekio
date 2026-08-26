import { LexicalResult, PhraseMatch, RankedSense, RankingResult, RankingEvidence, CandidateSense } from './types';

export class ContextualRanking {
  
  public rank(lexical: LexicalResult, phraseMatch: PhraseMatch | null, contextSentence: string): RankingResult {
    const candidates: RankedSense[] = [];
    const normalizedContext = contextSentence.toLowerCase();

    // 1. If we have a phrase match, add it as a candidate with a strong context bonus
    if (phraseMatch) {
      candidates.push({
        sense: {
          senseId: phraseMatch.entryId,
          lemmaId: phraseMatch.entryId,
          gloss: phraseMatch.translation.join(', '),
          partOfSpeech: phraseMatch.type
        },
        score: 0.90, // Strong, but not 1.0 (infallible)
        evidence: [
          { rule: `Phrase Match (${phraseMatch.type})`, weight: 0.90, matched: true, category: 'phrase' }
        ]
      });
    }

    for (const sense of lexical.senses) {
      // BASE SCORE (Frequency or Lexical Relevance)
      // Every valid sense starts with a baseline so it doesn't get a 0
      let baseScore = 0.10; 
      const evidence: RankingEvidence[] = [];

      if (sense.frequency !== undefined && sense.frequency > 0) {
         const freqBonus = Math.min(sense.frequency * 0.01, 0.10);
         baseScore += freqBonus;
         evidence.push({ rule: "Frequency Baseline", weight: freqBonus, matched: true, category: 'frequency' });
      } else {
         evidence.push({ rule: "Default Baseline", weight: 0.10, matched: true, category: 'frequency' });
      }

      let contextBonus = 0;
      const gloss = sense.gloss.toLowerCase();

      // SPECIFIC RULES FOR 'ziehen'
      if (lexical.lemma.text === "ziehen") {
        if (gloss.includes("move") || gloss.includes("relocate") || gloss.includes("migrate")) {
          if (normalizedContext.includes("nach ")) {
            contextBonus += 0.40;
            evidence.push({ rule: '"nach" + location', weight: 0.40, matched: true, category: 'context' });
          }
        }
        
        if (gloss.includes("pull") || gloss.includes("extract")) {
           if (normalizedContext.includes(" wagen") || normalizedContext.includes(" zahn")) {
             contextBonus += 0.35;
             evidence.push({ rule: 'Object implies pulling/extracting', weight: 0.35, matched: true, category: 'context' });
           }
        }

        if (gloss.includes("draw") && !gloss.includes("pull")) {
           if (normalizedContext.includes("linie") || normalizedContext.includes("kreis")) {
             contextBonus += 0.35;
             evidence.push({ rule: 'Object implies drawing', weight: 0.35, matched: true, category: 'context' });
           }
        }
      }

      candidates.push({ sense, score: baseScore + contextBonus, evidence });
    }

    candidates.sort((a, b) => b.score - a.score);

    const topCandidate = candidates.length > 0 ? candidates[0] : undefined;
    
    // Explicit Decision Logic
    let decision: "deterministic" | "needs_ai" = "needs_ai";
    
    if (topCandidate) {
      const hasPhraseEvidence = topCandidate.evidence.some(e => e.category === 'phrase');
      const hasContextEvidence = topCandidate.evidence.some(e => e.category === 'context');
      
      if (hasPhraseEvidence || hasContextEvidence) {
        decision = "deterministic";
      } else if (candidates.length === 1) {
        // Only one possible meaning exists, no AI needed
        decision = "deterministic";
      }
    }

    return {
      candidates,
      selected: topCandidate,
      decision
    };
  }
}
