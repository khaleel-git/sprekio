// Gemini API client for story generation

export interface StoryGenerationRequest {
  topic: string;
  level: string;        // A1, A2, B1, B2, C1, C2
  dialect?: string;     // null, "Bayerisch", "Österreichisch", "Schweizerdeutsch"
  wordCount?: number;   // target word count
  apiKey: string;
}

export interface GeneratedStory {
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  paragraphs: {
    text: string;
    translation: string;
    words: {
      word: string;
      translation: string;
      type: string;
      case?: string;
      gender?: string;
      separable?: boolean;
    }[];
  }[];
  vocabulary: {
    word: string;
    translation: string;
    example: string;
  }[];
  grammarFocus: string;
  quiz: {
    question: string;
    options: string[];
    correct: number;
  }[];
}

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

function buildPrompt(req: StoryGenerationRequest): string {
  const dialectNote = req.dialect
    ? `The story should be written primarily in ${req.dialect} dialect with standard German explanations in brackets for dialect words.`
    : "The story should be in standard German (Hochdeutsch).";

  const levelGuide: Record<string, string> = {
    A1: "Very simple sentences, present tense only, basic vocabulary (top 500 words), max 3-4 sentences per paragraph.",
    A2: "Simple sentences, present and past tense, common vocabulary, up to 5 sentences per paragraph.",
    B1: "Mixed tenses, some complex sentences, intermediate vocabulary, connectors like 'obwohl', 'weil', 'damit'.",
    B2: "Complex sentences, passive voice, subjunctive, rich vocabulary, idiomatic expressions.",
    C1: "Sophisticated language, academic register possible, complex grammar, nuanced vocabulary.",
    C2: "Literary quality, complex syntax, rare vocabulary, all grammatical structures.",
  };

  return `You are a German language teacher creating a CEFR-graded reading story for learners.

Level: ${req.level}
Level requirements: ${levelGuide[req.level] || levelGuide["B1"]}
Topic: ${req.topic}
Target length: approximately ${req.wordCount || 200} words
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
}

export async function generateStory(
  req: StoryGenerationRequest
): Promise<GeneratedStory> {
  const response = await fetch(`${GEMINI_API_URL}?key=${req.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(req) }] }],
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
    throw new Error(
      error.error?.message || `API error: ${response.status}`
    );
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error("No content returned from Gemini");

  // Extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse story JSON from response");

  const story = JSON.parse(jsonMatch[0]) as GeneratedStory;
  return story;
}
