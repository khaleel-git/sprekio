import { PhraseDetector } from './dictionary/PhraseDetector';
import { DictionaryEngine } from './dictionary/DictionaryEngine';
import { ContextualRanking } from './dictionary/ContextualRanking';

export interface Env {
  NVIDIA_API_KEY: string;
  GEMINI_API_KEY: string;
  DICTIONARY_DB: D1Database;
  AI_ENABLED: string;
  DEFAULT_AI_PROVIDER: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// NVIDIA's endpoint occasionally hangs instead of erroring out. Without a timeout that
// stalls the whole Worker request (and the extension request waiting on it) far longer
// than any UI should be left spinning.
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // =========================================================================
    // Sentence Translation (used for subtitle-level English translation)
    // =========================================================================
    if (url.pathname === "/api/translate-sentence" && request.method === "POST") {
      try {
        const { text, provider = "nvidia" } = await request.json() as { text: string, provider?: string };
        if (!text) {
          return new Response(JSON.stringify({ error: "Missing text" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (env.AI_ENABLED === "false") {
          return new Response(JSON.stringify({ error: "AI not available" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const prompt = `Translate the following German text to English. Return ONLY the English translation, no quotes, no explanation:\n\n${text}`;
        let translatedText = "";

        if (provider === "gemini") {
          const apiKey = env.GEMINI_API_KEY;
          if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
          const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 200 }
              })
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({})) as any;
            throw new Error(err.error?.message || err.message || `Gemini error: ${res.status}`);
          }
          const data = await res.json() as any;
          translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        } else {
          // NVIDIA
          const apiKey = env.NVIDIA_API_KEY;
          if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");
          const res = await fetchWithTimeout("https://integrate.api.nvidia.com/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: "meta/llama-3.3-70b-instruct",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                max_tokens: 200,
              })
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({})) as any;
            throw new Error(err.message || err.detail || `NVIDIA error: ${res.status}`);
          }
          const data = await res.json() as any;
          translatedText = data.choices?.[0]?.message?.content?.trim() || "";
        }

        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: translatedText }] }, finishReason: "STOP" }]
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // =========================================================================
    // Contextual Dictionary Engine (D1-only — no AI call in this path anymore)
    // =========================================================================
    // Word lookups used to fall back to an NVIDIA call to disambiguate between a word's
    // dictionary senses whenever the (unpopulated) frequency data couldn't rank them, which
    // was the source of most of the slowness/flakiness this endpoint saw. The dictionary's
    // top-ranked sense is now always the final answer — occasionally the "less common" sense
    // for a genuinely ambiguous word, but instant and never dependent on an upstream AI
    // provider being up.
    if (url.pathname === "/api/translate-word" && request.method === "POST") {
      try {
        const { word, contextSentence } = await request.json() as any;

        const engine = new DictionaryEngine(env.DICTIONARY_DB);
        const result = await engine.resolveSurface(word);

        if (!result) {
          console.log(JSON.stringify({ event: 'telemetry_lookup', resolution: 'not_found', surface: word }));
          return new Response(JSON.stringify({ status: 'not_found', surface: word }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Phrase Detection
        let phraseMatch = null;
        if (contextSentence) {
          const detector = new PhraseDetector();
          phraseMatch = detector.detect(result, contextSentence);
        }

        // Contextual Ranking
        const ranker = new ContextualRanking();
        const ranking = ranker.rank(result, phraseMatch, contextSentence || "");
        const selectedCandidate = ranking.selected;

        console.log(JSON.stringify({
           event: 'telemetry_lookup',
           surface: word,
           lemma: result.lemma.text,
           resolution: ranking.decision === 'needs_ai' ? 'ambiguous' : 'contextual',
           phraseMatched: !!phraseMatch
        }));

        const resolutionLabel = ranking.decision === 'needs_ai' ? 'ambiguous' : 'contextual';

        const finalResult = {
          surface: result.surface,
          normalized: result.normalized,
          lemma: phraseMatch ? phraseMatch.lemma : result.lemma.text,
          translations: ranking.candidates.map(c => ({
            text: c.sense.gloss,
            definition: c.sense.gloss,
            evidence: c.evidence,
            score: c.score,
            selectedBy: c === selectedCandidate ? (phraseMatch ? 'phrase' : 'context') : 'lexical'
          })),
          partOfSpeech: result.lemma.partOfSpeech,
          gender: result.lemma.gender,
          resolution: resolutionLabel,
          source: 'dictionary',
          cached: false,
          contextUsed: contextSentence ? true : false,
          phraseMatch,
          final: true
        };

        return new Response(JSON.stringify({ status: 'found', result: finalResult }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    // =========================================================================
    // Phase 5A: Batch Dictionary API
    // =========================================================================
    if (url.pathname === "/api/dictionary/batch" && request.method === "POST") {
      try {
        const { words, sentence } = await request.json() as { words: string[], sentence: string };
        if (!words || !Array.isArray(words)) {
           return new Response("Invalid request", { status: 400, headers: corsHeaders });
        }

        const engine = new DictionaryEngine(env.DICTIONARY_DB);
        // Deduplicate and cap at 100 words
        const uniqueWords = [...new Set(words)].slice(0, 100);
        
        const batchResults = await engine.resolveBatch(uniqueWords);
        
        const detector = new PhraseDetector();
        const ranker = new ContextualRanking();
        
        const finalResults = uniqueWords.map(word => {
           const lexical = batchResults.get(word);
           
           if (!lexical) {
              return {
                 surface: word,
                 resolution: "not_found"
              };
           }

           // Detect phrase
           const phraseMatch = detector.detect(lexical, sentence || "");
           
           // Rank
           const ranking = ranker.rank(lexical, phraseMatch, sentence || "");

           let resolutionStr = "lexical";
           if (ranking.decision === "needs_ai") {
              resolutionStr = "ambiguous";
           } else if (phraseMatch) {
              resolutionStr = "phrase";
           } else if (ranking.selected && ranking.selected.evidence.some(e => e.category === 'context')) {
              resolutionStr = "contextual";
           }

           const topTranslations = ranking.candidates.slice(0, 3).map(c => ({ text: c.sense.gloss }));

           return {
              surface: word,
              lemma: phraseMatch ? phraseMatch.lemma : lexical.lemma.text,
              translations: topTranslations,
              partOfSpeech: lexical.lemma.partOfSpeech,
              gender: lexical.lemma.gender,
              resolution: resolutionStr,
              final: resolutionStr !== "ambiguous"
           };
        });

        return new Response(JSON.stringify({
           version: "sprekio-de-2026-08-04",
           results: finalResults
        }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });

      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        const { topic, level, dialect, wordCount, apiKey, provider = "nvidia" } = await request.json() as any;

        const TARGET_API_KEY = (provider === "gemini" ? env.GEMINI_API_KEY : env.NVIDIA_API_KEY) || apiKey;
        
        if (!TARGET_API_KEY) {
          return new Response(JSON.stringify({ error: `${provider.toUpperCase()}_API_KEY is not configured in Cloudflare Environment Variables, and no key was provided.` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const dialectNote = dialect
          ? `The story should be written primarily in ${dialect} dialect with standard German explanations in brackets for dialect words.`
          : "The story should be in standard German (Hochdeutsch).";

        const levelGuide: Record<string, string> = {
          A1: "Very simple sentences, present tense only, basic vocabulary (top 500 words), max 3-4 sentences per paragraph.",
          A2: "Simple sentences, present and past tense, common vocabulary, up to 5 sentences per paragraph.",
          B1: "Mixed tenses, some complex sentences, intermediate vocabulary, connectors like 'obwohl', 'weil', 'damit'.",
          B2: "Complex sentences, passive voice, subjunctive, rich vocabulary, idiomatic expressions.",
          C1: "Sophisticated language, academic register possible, complex grammar, nuanced vocabulary.",
          C2: "Literary quality, complex syntax, rare vocabulary, all grammatical structures.",
        };

        const prompt = `You are a German language teacher creating a CEFR-graded reading story for learners.

Level: ${level}
Level requirements: ${levelGuide[level] || levelGuide["B1"]}
Topic: ${topic}
Target length: approximately ${wordCount || 200} words
${dialectNote}

Create a complete story and return it as a JSON object with EXACTLY this structure:
{
  "title": "Story title in German",
  "titleEn": "Story title in English",
  "description": "2-sentence summary in German",
  "descriptionEn": "2-sentence summary in English",
  "paragraphs": [
    {
      "text": "German paragraph text",
      "translation": "English translation of paragraph",
      "words": [
        {
          "word": "individual word",
          "translation": "English translation",
          "type": "noun|verb|adjective|adverb|preposition|conjunction|pronoun|article|phrase",
          "case": "Nominativ|Akkusativ|Dativ|Genitiv (for nouns/articles only, omit if not applicable)",
          "gender": "masculine|feminine|neuter (for nouns only, omit if not applicable)",
          "separable": true (only for separable verbs, omit otherwise)
        }
      ]
    }
  ],
  "vocabulary": [
    {
      "word": "key word or phrase",
      "translation": "English translation",
      "example": "Example sentence in German"
    }
  ],
  "grammarFocus": "Short description of main grammar points in this story",
  "quiz": [
    {
      "question": "Comprehension question in German",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0
    }
  ]
}

Requirements:
- Include 3-5 paragraphs
- Annotate 5-8 key words per paragraph (the most important vocabulary)
- Include 5-8 vocabulary items total
- Include exactly 3 quiz questions
- Make the story engaging and culturally relevant to German-speaking countries
- Return ONLY the JSON, no other text`;

        let response;
        let text = "";

        if (provider === "gemini") {
          response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${TARGET_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 4000, responseMimeType: "application/json" }
            })
          }, 30000);
          if (!response.ok) {
            const err = await response.json().catch(() => ({})) as any;
            throw new Error(err.error?.message || err.message || `Gemini API Error: ${response.status}`);
          }
          const data = await response.json() as any;
          text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } else {
          response = await fetchWithTimeout("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${TARGET_API_KEY}`
            },
            body: JSON.stringify({
              model: "meta/llama-3.3-70b-instruct",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.7,
              top_p: 0.9,
              max_tokens: 4000
            })
          }, 30000);
          if (!response.ok) {
            const err = await response.json().catch(() => ({})) as any;
            throw new Error(err.message || err.detail || `NVIDIA API Error: ${response.status}`);
          }
          const data = await response.json() as any;
          text = data.choices?.[0]?.message?.content || "";
        }

        if (!text) {
          throw new Error("No content returned from AI");
        }

        // Validate JSON and return
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          const cleanText = jsonMatch ? jsonMatch[0] : text;
          const parsed = JSON.parse(cleanText);
          
          return new Response(JSON.stringify(parsed), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } catch (parseError) {
          console.error("JSON Parse Error:", parseError, "Raw Text:", text);
          return new Response(JSON.stringify({ 
            error: "AI generated malformed JSON. Please try generating again.", 
            rawText: text 
          }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    
    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
