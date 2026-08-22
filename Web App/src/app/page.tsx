"use client";

import { useState } from "react";
import { stories, CEFRLevel, CEFR_LEVELS, CEFR_DESCRIPTIONS } from "@/lib/stories";
import { useStore } from "@/lib/store";
import StoryCard from "@/components/StoryCard";
import { Search, Filter, Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL = "All";

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel | typeof ALL>(ALL);
  const [showDialect, setShowDialect] = useState(false);
  const { progress } = useStore();

  const filtered = stories.filter((s) => {
    const matchSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.topic.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchLevel = selectedLevel === ALL || s.level === selectedLevel;
    const matchDialect = !showDialect || s.dialect !== null;
    return matchSearch && matchLevel && matchDialect;
  });

  const completedCount = progress.completedStories.length;
  const totalCount = stories.length;

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
          <div className="text-6xl">🇩🇪</div>
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
            placeholder="Search stories…"
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
              {level} · {CEFR_DESCRIPTIONS[level]}
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
            <StoryCard key={story.id} story={story} />
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
