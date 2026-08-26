import { RankedSense } from './types';

export const VERSIONS = {
  dictionary: "sprekio-de-2026-08-04",
  phrase: "phrases-1",
  ranking: "ranking-1",
  aiPrompt: "ai-prompt-1"
};

export class AIResolver {
  constructor(
    private apiKey: string,
    private db: D1Database
  ) {}

  public async generateCacheKey(lemma: string, contextSentence: string): Promise<string> {
    const rawString = `${VERSIONS.dictionary}|${VERSIONS.phrase}|${VERSIONS.ranking}|${VERSIONS.aiPrompt}|${lemma}|${contextSentence}`;
    const msgUint8 = new TextEncoder().encode(rawString);                           
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);           
    const hashArray = Array.from(new Uint8Array(hashBuffer));                     
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  public async resolve(lemma: string, contextSentence: string, candidates: RankedSense[]): Promise<{ candidateSenseId: string, reason: string } | null> {
    const cacheKey = await this.generateCacheKey(lemma, contextSentence);
    
    // 1. Check AI Cache
    const cached = await this.db.prepare('SELECT result FROM ai_cache WHERE cache_key = ?').bind(cacheKey).first<{ result: string }>();
    if (cached) {
      return JSON.parse(cached.result);
    }

    // Mock response for testing
    if (this.apiKey === 'mock') {
      const mockResult = {
        candidateSenseId: candidates.length > 0 ? candidates[candidates.length - 1].sense.senseId : "mock_123",
        reason: "Mock AI decided this was the best context based on simulated reasoning."
      };
      
      await this.db.prepare('INSERT INTO ai_cache (cache_key, result, created_at) VALUES (?, ?, ?)')
        .bind(cacheKey, JSON.stringify(mockResult), Date.now())
        .run();
        
      return mockResult;
    }

    const prompt = `Target word lemma: ${lemma}
Context sentence: "${contextSentence}"

Candidate senses:
${candidates.map((c, i) => `${i + 1}. [ID: ${c.sense.senseId}] ${c.sense.gloss}`).join('\n')}

Choose the best candidate for this context. 
Return ONLY a valid JSON object with exactly this structure:
{
  "candidateSenseId": "the ID of the best sense, e.g. s_123",
  "reason": "short explanation of why this fits"
}`;

    try {
      let textContent: string | null = null;

      {
        const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: "meta/llama-3.1-8b-instruct",
            messages: [
              { role: "system", content: "You are a German linguistics expert. Always respond with valid JSON only." },
              { role: "user", content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 150,
          })
        });
        if (!res.ok) {
          console.error("NVIDIA Resolver Error:", await res.text());
          return null;
        }
        const data = await res.json() as any;
        textContent = data.choices?.[0]?.message?.content?.trim() || null;
        // Strip markdown code fences if NVIDIA wraps response in ```json ... ```
        if (textContent) {
          textContent = textContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        }
      }

      if (!textContent) return null;

      const aiParsed = JSON.parse(textContent);

      // Save to cache
      await this.db.prepare('INSERT INTO ai_cache (cache_key, result, created_at) VALUES (?, ?, ?)')
        .bind(cacheKey, JSON.stringify(aiParsed), Date.now())
        .run();

      return {
        candidateSenseId: aiParsed.candidateSenseId,
        reason: aiParsed.reason
      };
    } catch (e) {
      console.error("AI Resolver Exception:", e);
      return null;
    }
  }
}
