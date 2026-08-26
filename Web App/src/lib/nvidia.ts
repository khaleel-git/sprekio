// NVIDIA API client for story generation
import { Paragraph } from "./stories";

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface StoryGenerationRequest {
  topic: string;
  level: CEFRLevel;
  dialect?: string;
  wordCount?: number;
  apiKey?: string;
  provider?: "nvidia";
}

export interface GeneratedStory {
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  paragraphs: Paragraph[];
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

export async function generateStory(
  req: StoryGenerationRequest
): Promise<GeneratedStory> {
  const response = await fetch("https://sprekio-backend.khaleel-eu.workers.dev/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...req, provider: "nvidia" }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Server error: ${response.status}`);
  }

  return await response.json() as GeneratedStory;
}
