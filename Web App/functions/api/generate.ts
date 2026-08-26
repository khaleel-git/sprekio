export async function onRequestPost(context: any) {
  const { request, env } = context;
  
  try {
    const reqBody = await request.json();
    const { topic, level, dialect, wordCount, apiKey } = reqBody;

    const TARGET_API_KEY = env.NVIDIA_API_KEY || apiKey;
    
    if (!TARGET_API_KEY) {
      return new Response(JSON.stringify({ error: "NVIDIA_API_KEY is not configured in Cloudflare Environment Variables, and no key was provided." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
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
        headers: { "Content-Type": "application/json" }
      });
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError, "Raw Text:", text);
      return new Response(JSON.stringify({ 
        error: "AI generated malformed JSON. Please try generating again.", 
        rawText: text 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
