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

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
