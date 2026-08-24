"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { generateStory } from "@/lib/gemini";
import { CEFRLevel, CEFR_LEVELS, Story, Paragraph } from "@/lib/stories";
import { Sparkles, Loader2, BookOpen, Globe2, AlertCircle, Save, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const TOPICS = [
  "Daily life in Germany",
  "Travel and transport",
  "Food and restaurants",
  "Work and career",
  "German history",
  "Technology",
  "Sports",
  "Nature and environment",
  "Family and relationships",
  "Shopping and money",
  "Health and medicine",
  "Art and culture",
];

const DIALECTS = [
  { value: "", label: "Standard German (Hochdeutsch)" },
  { value: "Bayerisch", label: "🍺 Bayerisch (Bavarian)" },
  { value: "Österreichisch", label: "🏔️ Österreichisch (Austrian)" },
  { value: "Schweizerdeutsch", label: "🧀 Schweizerdeutsch (Swiss German)" },
];

export default function GeneratePage() {
  const [topic, setTopic] = useState("Daily life in Germany");
  const [customTopic, setCustomTopic] = useState("");
  const [level, setLevel] = useState<CEFRLevel>("B1");
  const [dialect, setDialect] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<Partial<Story> | null>(null);
  const [saved, setSaved] = useState(false);

  const { progress } = useStore();

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setGenerated(null);
    setSaved(false);

    try {
      const story = await generateStory({
        topic: customTopic.trim() || topic,
        level,
        dialect: dialect || undefined,
        wordCount: 200,
      });
      setGenerated(story as unknown as Partial<Story>);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to generate story.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStory = () => {
    if (!generated) return;
    // In a real app, this would save to a backend. For now, we save to localStorage.
    const saved = JSON.parse(localStorage.getItem("dl_generated_stories") || "[]");
    const newStory = {
      ...generated,
      id: `gen-${Date.now()}`,
      level,
      dialect: dialect || null,
      topic: customTopic || topic,
      duration: 5,
      imageEmoji: "✨",
      color: "from-violet-400 to-purple-600",
      isPublic: false,
      upvotes: 0,
    };
    localStorage.setItem("dl_generated_stories", JSON.stringify([...saved, newStory]));
    setSaved(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="w-6 h-6" />
          <h1 className="text-xl font-bold">AI Story Generator</h1>
        </div>
        <p className="text-purple-100 text-sm">
          Generate personalized German stories on any topic using Google Gemini AI.
        </p>
      </div>

      {/* Configuration */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-5">
        <h2 className="font-semibold text-gray-900">Story Settings</h2>

        {/* CEFR Level */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">CEFR Level</label>
          <div className="flex flex-wrap gap-2">
            {CEFR_LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  level === l
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Topic */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Topic</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => { setTopic(t); setCustomTopic(""); }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                  topic === t && !customTopic
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            placeholder="Or enter a custom topic…"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        {/* Dialect */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
            <Globe2 className="w-3.5 h-3.5" />
            Dialect
          </label>
          <div className="flex flex-col gap-2">
            {DIALECTS.map((d) => (
              <label key={d.value} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="dialect"
                  value={d.value}
                  checked={dialect === d.value}
                  onChange={() => setDialect(d.value)}
                  className="accent-violet-600"
                />
                <span className="text-sm text-gray-700">{d.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white transition-all",
          loading
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 active:scale-95"
        )}
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Generating story…
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Generate Story
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Generated story preview */}
      {generated && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4 animate-slide-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-violet-600 uppercase tracking-wider">Generated ✨</span>
              <h2 className="text-lg font-bold text-gray-900 mt-1">{generated.title}</h2>
              <p className="text-sm text-gray-500">{generated.description}</p>
            </div>
            <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full font-semibold">{level}</span>
          </div>

          {/* Story paragraphs */}
          <div className="space-y-3">
            {generated.paragraphs?.map((p: Paragraph, i: number) => (
              <div key={i} className="bg-gray-50 rounded-xl p-4">
                <p className="text-gray-900 text-sm leading-relaxed">{p.text}</p>
                <p className="text-gray-400 text-xs italic mt-2">{p.translation}</p>
              </div>
            ))}
          </div>

          {/* Grammar focus */}
          {generated.grammarFocus && (
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xs text-blue-600 font-semibold mb-1">Grammar Focus</p>
              <p className="text-sm text-blue-900">{generated.grammarFocus}</p>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSaveStory}
            disabled={saved}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all",
              saved
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-violet-600 text-white hover:bg-violet-700 active:scale-95"
            )}
          >
            <BookOpen className="w-4 h-4" />
            {saved ? "Saved to library ✓" : "Save to My Library"}
          </button>
        </div>
      )}
    </div>
  );
}
