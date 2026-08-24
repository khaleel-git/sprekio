export interface Env {
  GEMINI_API_KEY: string;
  NVIDIA_API_KEY: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Helper for NVIDIA API Request
async function fetchNvidia(prompt: string, apiKey: string, isJson: boolean = false) {
  const payload: any = {
    model: "meta/llama-3.1-8b-instruct",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 1024
  };
  
  if (isJson) {
    // Some NVIDIA models support response_format for JSON, or we can just rely on the prompt instructing it.
    // Llama 3.1 instruct usually honors the prompt well.
    payload.response_format = { type: "json_object" };
  }

  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`NVIDIA API Error: ${res.status} - ${errorText}`);
  }

  const data: any = await res.json();
  const textContent = data.choices?.[0]?.message?.content || "";
  return textContent;
}

// Helper for Gemini API Request
async function fetchGemini(prompt: string, apiKey: string, isJson: boolean = false) {
  const payload: any = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1 },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

  if (isJson) {
    payload.generationConfig.responseMimeType = "application/json";
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API Error: ${res.status} - ${errorText}`);
  }

  const data: any = await res.json();
  // We need to return exactly the structure we were returning before, 
  // which was the raw string output of the whole object! 
  // Wait, no, previously we were returning `await geminiRes.text()`, which is a JSON containing the Gemini response structure.
  // The Chrome extension unpacks it: `data.candidates[0].content.parts[0].text`.
  // If we want them to share the SAME parsing on the frontend, the easiest way is to mock the Gemini response structure!
  return data; 
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/translate-sentence" && request.method === "POST") {
      try {
        const { text, provider } = await request.json();
        
        const prompt = `Translate the following German text into English. Respond ONLY with the translation, no quotes, no conversational filler:\n\n${text}`;

        let responseText = "";

        if (provider === "nvidia") {
          responseText = await fetchNvidia(prompt, env.NVIDIA_API_KEY, false);
          // Mock Gemini response structure for the frontend
          const mockResponse = {
            candidates: [{ content: { parts: [{ text: responseText }] } }]
          };
          return new Response(JSON.stringify(mockResponse), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          const rawGeminiData = await fetchGemini(prompt, env.GEMINI_API_KEY, false);
          return new Response(JSON.stringify(rawGeminiData), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === "/api/translate-word" && request.method === "POST") {
      try {
        const { word, contextSentence, provider } = await request.json();
        
        const prompt = `You are a German learning dictionary. The user is reading this sentence: "${contextSentence}".
They hovered over the word: "${word}".
Provide the translation of the word in this specific context.
Return ONLY a valid JSON object (no markdown, no backticks) with the following properties:
- translation: (string) The English translation
- type: (string) e.g., Noun, Verb, Adjective
- gender: (string, optional) der, die, das (only for nouns)
- case: (string, optional) Nominativ, Akkusativ, Dativ, Genitiv (if applicable in the context)
- root: (string) The base form of the word (infinitive for verbs, singular for nouns)`;

        let responseText = "";

        if (provider === "nvidia") {
          responseText = await fetchNvidia(prompt, env.NVIDIA_API_KEY, true);
          // Mock Gemini response structure for the frontend
          const mockResponse = {
            candidates: [{ content: { parts: [{ text: responseText }] } }]
          };
          return new Response(JSON.stringify(mockResponse), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          const rawGeminiData = await fetchGemini(prompt, env.GEMINI_API_KEY, true);
          return new Response(JSON.stringify(rawGeminiData), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        const { topic, level, dialect, wordCount, apiKey, provider = "gemini" } = await request.json();

        const TARGET_API_KEY = provider === "nvidia" ? (env.NVIDIA_API_KEY || apiKey) : (env.GEMINI_API_KEY || apiKey);
        
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

        if (provider === "nvidia") {
          response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${TARGET_API_KEY}`
            },
            body: JSON.stringify({
              model: "meta/llama-3.1-70b-instruct",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.7,
              top_p: 0.9,
              max_tokens: 4000,
            })
          });
          
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || err.detail || `NVIDIA API Error: ${response.status}`);
          }
          const data = await response.json();
          text = data.choices?.[0]?.message?.content || "";
        } else {
          const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";
          response = await fetch(`${GEMINI_API_URL}?key=${TARGET_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.8,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 4096,
                responseMimeType: "application/json",
              },
            }),
          });

          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `Gemini API Error: ${response.status}`);
          }
          const data = await response.json();
          text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
