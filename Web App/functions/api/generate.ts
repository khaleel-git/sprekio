export async function onRequestPost(context: any) {
  const { request, env } = context;
  
  try {
    const GEMINI_API_KEY = env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY is not configured in Cloudflare Environment Variables" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const reqBody = await request.json();
    const { topic, level, dialect, wordCount } = reqBody;

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

    const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
    
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return new Response(JSON.stringify({ error: error.error?.message || "API error" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return new Response(JSON.stringify({ error: "No content returned from Gemini" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: "Could not parse JSON from response" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(jsonMatch[0], {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
