"use client";

import { useState, useEffect } from "react";
import { stories as staticStories, CEFRLevel, CEFR_LEVELS, CEFR_DESCRIPTIONS, Story } from "@/lib/stories";
import { useStore } from "@/lib/store";
import StoryCard from "@/components/StoryCard";
import { Search, Filter, Globe2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL = "All";

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel | typeof ALL>(ALL);
  const [showDialect, setShowDialect] = useState(false);
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [generatedStories, setGeneratedStories] = useState<Story[]>([]);
  const { progress } = useStore();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("dl_generated_stories") || "[]");
      setGeneratedStories(saved);
    } catch (e) {}
  }, []);

  const allStories = [...generatedStories, ...staticStories];

  const handleDeleteGenerated = (id: string) => {
    const updated = generatedStories.filter((s) => s.id !== id);
    setGeneratedStories(updated);
    localStorage.setItem("dl_generated_stories", JSON.stringify(updated));
  };

  const filtered = allStories.filter((s) => {
    const matchSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.topic.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchLevel = selectedLevel === ALL || s.level === selectedLevel;
    const matchDialect = !showDialect || s.dialect !== null;

    const isRead = progress.completedStories.includes(s.id);
    const matchRead =
      readFilter === "all" ||
      (readFilter === "read" && isRead) ||
      (readFilter === "unread" && !isRead);

    return matchSearch && matchLevel && matchDialect && matchRead;
  });

  const completedCount = progress.completedStories.length;
  const totalCount = allStories.length;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-3xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Guten Tag! 👋</h1>
            <p className="text-blue-100 text-sm mb-4">
              Learn German through stories — from A1 to C2.
            </p>
            <div className="flex gap-4 text-sm">
              <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
                <div className="font-bold text-lg">{completedCount}</div>
                <div className="text-blue-200 text-xs">Stories read</div>
              </div>
              <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
                <div className="font-bold text-lg">{totalCount}</div>
                <div className="text-blue-200 text-xs">Total stories</div>
              </div>
              <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
                <div className="font-bold text-lg">{progress.xp}</div>
                <div className="text-blue-200 text-xs">XP earned</div>
              </div>
            </div>
          </div>
          <div className="text-6xl">📖</div>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-blue-200 mb-1">
              <span>Reading progress</span>
              <span>{Math.round((completedCount / totalCount) * 100)}%</span>
            </div>
            <div className="bg-white/20 rounded-full h-2">
              <div
                className="bg-white rounded-full h-2 transition-all duration-500"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search stories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setSelectedLevel(ALL)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
              selectedLevel === ALL
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
            )}
          >
            All levels
          </button>

          <button
            onClick={() => setReadFilter(readFilter === "unread" ? "all" : "unread")}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
              readFilter === "unread"
                ? "bg-green-600 text-white border-green-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-green-300"
            )}
          >
            Unread
          </button>
          <button
            onClick={() => setReadFilter(readFilter === "read" ? "all" : "read")}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
              readFilter === "read"
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
            )}
          >
            Read
          </button>

          {CEFR_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setSelectedLevel(level)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                selectedLevel === level
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
              )}
            >
              {level} - {CEFR_DESCRIPTIONS[level]}
            </button>
          ))}
          <button
            onClick={() => setShowDialect(!showDialect)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
              showDialect
                ? "bg-yellow-500 text-white border-yellow-500"
                : "bg-white text-gray-600 border-gray-200 hover:border-yellow-300"
            )}
          >
            <Globe2 className="w-3 h-3" />
            Dialects only
          </button>
        </div>
      </div>

      {/* Story grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((story) => (
            <div key={story.id} className="relative group">
              <StoryCard story={story} />
              {story.id.startsWith("gen-") && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteGenerated(story.id);
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
                  title="Delete generated story"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🔍</div>
          <p className="font-medium text-gray-500">No stories found</p>
          <p className="text-sm mt-1">Try a different search or filter</p>
        </div>
      )}
    </div>
  );
}
