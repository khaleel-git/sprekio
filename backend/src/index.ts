import { PhraseDetector } from './dictionary/PhraseDetector';
import { DictionaryEngine } from './dictionary/DictionaryEngine';
import { ContextualRanking } from './dictionary/ContextualRanking';
import { AIResolver } from './dictionary/aiResolver';

export interface Env {
  NVIDIA_API_KEY: string;
  DICTIONARY_DB: D1Database;
  AI_ENABLED: string;
  DEFAULT_AI_PROVIDER: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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
        const { text } = await request.json() as { text: string };
        if (!text) {
          return new Response(JSON.stringify({ error: "Missing text" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (env.AI_ENABLED === "false") {
          return new Response(JSON.stringify({ error: "AI not available" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const prompt = `Translate the following German text to English. Return ONLY the English translation, no quotes, no explanation:\n\n${text}`;

        let translatedText = "";

        const apiKey = env.NVIDIA_API_KEY;
        if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");
        const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "openai/gpt-oss-20b",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.1,
              max_tokens: 200,
            })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as any;
          const errorMessage = String(err.message || err.detail || `NVIDIA error: ${res.status}`);
          throw new Error(errorMessage);
        }
        const data = await res.json() as any;
        translatedText = data.choices?.[0]?.message?.content?.trim() || "";

        // Keep the response shape expected by the extension.
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
    // Phase 3D: Contextual Engine + AI Fallback
    // =========================================================================
    if (url.pathname === "/api/translate-word" && request.method === "POST") {
      try {
        const { word, contextSentence, apiKey } = await request.json() as any;
        
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

        let finalResolution = ranking.decision;
        let selectedCandidate = ranking.selected;
        let aiReason = undefined;
        let aiCacheHit = false;

        const aiKey = env.NVIDIA_API_KEY || apiKey;

        // Phase 3D: AI Disambiguation
        if (ranking.decision === "needs_ai" && contextSentence && aiKey) {
           if (env.AI_ENABLED !== "true" && env.AI_ENABLED !== true) {
             console.log(`[Sprekio] AI Fallback skipped for '${word}' due to AI_ENABLED=false.`);
           } else {
             const ai = new AIResolver(aiKey, env.DICTIONARY_DB);
             
             // Check if it's cached first to track metric
             const cacheKey = await ai.generateCacheKey(result.lemma.text, contextSentence);
             const cached = await env.DICTIONARY_DB.prepare('SELECT 1 FROM ai_cache WHERE cache_key = ?').bind(cacheKey).first();
             if (cached) aiCacheHit = true;

             const aiDecision = await ai.resolve(result.lemma.text, contextSentence, ranking.candidates);
             if (aiDecision) {
                const matchedSenseIndex = ranking.candidates.findIndex(c => c.sense.senseId === aiDecision.candidateSenseId);
                if (matchedSenseIndex !== -1) {
                   selectedCandidate = ranking.candidates[matchedSenseIndex];
                   
                   // Move it to the top
                   ranking.candidates.splice(matchedSenseIndex, 1);
                   ranking.candidates.unshift(selectedCandidate);

                   aiReason = aiDecision.reason;
                   finalResolution = "needs_ai";
                }
             }
           }
        }

        // Telemetry Emission
        console.log(JSON.stringify({
           event: 'telemetry_lookup',
           surface: word,
           lemma: result.lemma.text,
           resolution: finalResolution === 'needs_ai' ? 'ai' : 'contextual',
           aiCacheHit,
           phraseMatched: !!phraseMatch
        }));

        const isAiResolution = finalResolution === 'needs_ai';
        const resolutionLabel = isAiResolution ? (aiCacheHit ? 'ai_cache' : 'ai') : 'contextual';

        const finalResult = {
          surface: result.surface,
          normalized: result.normalized,
          lemma: phraseMatch ? phraseMatch.lemma : result.lemma.text,
          translations: ranking.candidates.map(c => {
            const isSelected = c === selectedCandidate;
            const mapped: any = {
              text: c.sense.gloss,
              definition: c.sense.gloss,
              evidence: c.evidence,
              selectedBy: isSelected ? (isAiResolution ? 'ai' : (phraseMatch ? 'phrase' : 'context')) : 'lexical'
            };
            
            // Only include score if it wasn't an AI selection, since deterministic scores don't apply to AI choice
            if (!isAiResolution || !isSelected) {
               mapped.score = c.score;
            }

            if (isSelected && aiReason) {
               mapped.aiReason = aiReason;
            }
            return mapped;
          }),
          partOfSpeech: result.lemma.partOfSpeech,
          gender: result.lemma.gender,
          resolution: resolutionLabel,
          source: 'dictionary',
          cached: false,
          contextUsed: contextSentence ? true : false,
          phraseMatch
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
        const { topic, level, dialect, wordCount, apiKey, provider = "nvidia" } = await request.json();

        const TARGET_API_KEY = env.NVIDIA_API_KEY || apiKey;
        
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

        response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${TARGET_API_KEY}`
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 4000
          })
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({})) as any;
          throw new Error(err.message || err.detail || `NVIDIA API Error: ${response.status}`);
        }
        const data = await response.json() as any;
        text = data.choices?.[0]?.message?.content || "";

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
    
    // =========================================================================
    // GET /api/transcript
    // =========================================================================
    if (url.pathname === "/api/transcript" && request.method === "GET") {
        try {
            const v = url.searchParams.get("v");
            if (!v) {
                return new Response(JSON.stringify({ error: "No video id provided" }), {
                    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
            
            const transcript = await YoutubeTranscript.fetchTranscript(v, { lang: 'de' })
              .catch((err: any) => YoutubeTranscript.fetchTranscript(v)); // fallback to default lang if de is not found
            
            return new Response(JSON.stringify({ transcript }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        } catch (e: any) {
             return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
             });
        }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
