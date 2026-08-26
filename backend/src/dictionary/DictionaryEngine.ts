import { CandidateSense, LexicalResult } from './types';

export class DictionaryEngine {
  constructor(private db: D1Database) {}

  /**
   * Normalizes the surface form for deterministic lookup.
   * Handles capitalization and unicode safely.
   */
  private normalizeSurface(surface: string): string {
    return surface.trim().toLowerCase();
  }

  /**
   * Resolves a surface word to its lexical identity and candidate senses.
   */
  public async resolveSurface(surface: string): Promise<LexicalResult | null> {
    const normalized = this.normalizeSurface(surface);
    
    // 1. Morphological Resolution: find all lemma IDs matching this normalized form
    // Order by lemma frequency (if we had it) or just arbitrarily, limiting to avoid explosion
    const formsResult = await this.db.prepare(
      'SELECT lemma_id, grammatical_info FROM forms WHERE normalized = ? LIMIT 5'
    ).bind(normalized).all<{ lemma_id: string, grammatical_info: string }>();

    if (!formsResult.success || formsResult.results.length === 0) {
      return null;
    }

    // Heuristic: If multiple lemmas match, pick the most appropriate one.
    // For now, pick the first distinct lemma to keep Phase 3A deterministic.
    const lemmaId = formsResult.results[0].lemma_id;

    // 2. Lemma Retrieval
    const lemmaResult = await this.db.prepare(
      'SELECT id, lemma, part_of_speech, gender FROM lemmas WHERE id = ?'
    ).bind(lemmaId).first<{ id: string, lemma: string, part_of_speech: string, gender: string }>();

    if (!lemmaResult) {
      return null;
    }

    // 3. Sense Retrieval with Candidate Limit (Phase 3.5 constraint)
    const sensesResult = await this.db.prepare(
      'SELECT id, translation, frequency FROM senses WHERE lemma_id = ? ORDER BY frequency DESC, id ASC LIMIT 10'
    ).bind(lemmaId).all<{ id: string, translation: string, frequency: number }>();

    const senses: CandidateSense[] = sensesResult.results.map(row => ({
      senseId: row.id,
      lemmaId: lemmaId,
      gloss: row.translation,
      frequency: row.frequency,
      partOfSpeech: lemmaResult.part_of_speech
    }));

    return {
      surface,
      normalized,
      lemma: {
        id: lemmaResult.id,
        text: lemmaResult.lemma,
        partOfSpeech: lemmaResult.part_of_speech,
        gender: lemmaResult.gender || undefined
      },
      senses
    };
  }

  /**
   * Resolves a batch of surface words efficiently using SQL IN clauses.
   */
  public async resolveBatch(surfaces: string[]): Promise<Map<string, LexicalResult>> {
    const resultMap = new Map<string, LexicalResult>();
    if (surfaces.length === 0) return resultMap;

    const uniqueSurfaces = [...new Set(surfaces)];
    const normalizedPairs = uniqueSurfaces.map(s => ({ original: s, normalized: this.normalizeSurface(s) }));
    const normalizedList = [...new Set(normalizedPairs.map(p => p.normalized))];

    // Chunking to respect SQLite limits if batch is large
    const CHUNK_SIZE = 50;
    
    for (let i = 0; i < normalizedList.length; i += CHUNK_SIZE) {
      const chunk = normalizedList.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      
      // 1. Get Forms
      const formsResult = await this.db.prepare(
        `SELECT normalized, lemma_id FROM forms WHERE normalized IN (${placeholders}) GROUP BY normalized`
      ).bind(...chunk).all<{ normalized: string, lemma_id: string }>();

      if (!formsResult.success || formsResult.results.length === 0) continue;

      const lemmaIds = [...new Set(formsResult.results.map(r => r.lemma_id))];
      const lemmaPlaceholders = lemmaIds.map(() => '?').join(',');

      // 2. Get Lemmas
      const lemmasResult = await this.db.prepare(
        `SELECT id, lemma, part_of_speech, gender FROM lemmas WHERE id IN (${lemmaPlaceholders})`
      ).bind(...lemmaIds).all<{ id: string, lemma: string, part_of_speech: string, gender: string }>();

      // 3. Get Senses
      const sensesResult = await this.db.prepare(
        `SELECT id, lemma_id, translation, frequency FROM senses WHERE lemma_id IN (${lemmaPlaceholders})`
      ).bind(...lemmaIds).all<{ id: string, lemma_id: string, translation: string, frequency: number }>();

      const lemmaMap = new Map(lemmasResult.results.map(l => [l.id, l]));
      const senseMap = new Map<string, any[]>();
      sensesResult.results.forEach(s => {
         if (!senseMap.has(s.lemma_id)) senseMap.set(s.lemma_id, []);
         senseMap.get(s.lemma_id)!.push(s);
      });

      // Construct Results
      formsResult.results.forEach(form => {
        const lemma = lemmaMap.get(form.lemma_id);
        if (!lemma) return;
        
        const rawSenses = senseMap.get(form.lemma_id) || [];
        rawSenses.sort((a, b) => b.frequency - a.frequency);
        const topSenses = rawSenses.slice(0, 10);

        const senses: CandidateSense[] = topSenses.map(s => ({
          senseId: s.id,
          lemmaId: lemma.id,
          gloss: s.translation,
          frequency: s.frequency,
          partOfSpeech: lemma.part_of_speech
        }));

        const originals = normalizedPairs.filter(p => p.normalized === form.normalized);
        originals.forEach(orig => {
           resultMap.set(orig.original, {
             surface: orig.original,
             normalized: form.normalized,
             lemma: {
               id: lemma.id,
               text: lemma.lemma,
               partOfSpeech: lemma.part_of_speech,
               gender: lemma.gender || undefined
             },
             senses
           });
        });
      });
    }

    return resultMap;
  }
}
