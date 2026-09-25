"use client";

import { useState } from "react";
import { stories as allStories, CEFRLevel, CEFR_LEVELS, CEFR_DESCRIPTIONS } from "@/lib/stories";
import { useStore } from "@/lib/store";
import StoryCard from "@/components/StoryCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Search, Globe2, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL = "All";

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel | typeof ALL>(ALL);
  const [showDialect, setShowDialect] = useState(false);
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const { progress } = useStore();

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
      readFilter === "all" || (readFilter === "read" && isRead) || (readFilter === "unread" && !isRead);

    return matchSearch && matchLevel && matchDialect && matchRead;
  });

  const completedCount = progress.completedStories.length;
  const totalCount = allStories.length;
  const hasStarted = completedCount > 0;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-ink text-white p-8 md:p-10">
        <div
          className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-brand/25 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <p className="text-brand font-semibold text-sm tracking-wide uppercase mb-3">
            {hasStarted ? "Willkommen zurück" : "Deutsch lernen, auf Ihre Weise"}
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-semibold leading-tight max-w-xl">
            {hasStarted ? "Guten Tag! Ready for your next story?" : "Learn German through stories that actually hold your attention."}
          </h1>
          <p className="text-white/60 text-sm md:text-base mt-4 max-w-lg">
            Graded reading from A1 to C2, real YouTube subtitles with click-to-translate, and
            spaced-repetition vocab that follows you from the video to the page.
          </p>

          {totalCount > 0 && (
            <div className="flex flex-wrap gap-6 mt-7">
              <div>
                <div className="font-display text-2xl font-semibold">{completedCount}</div>
                <div className="text-white/50 text-xs mt-0.5">stories read</div>
              </div>
              <div>
                <div className="font-display text-2xl font-semibold">{totalCount}</div>
                <div className="text-white/50 text-xs mt-0.5">in the library</div>
              </div>
              <div>
                <div className="font-display text-2xl font-semibold">{progress.xp.toLocaleString()}</div>
                <div className="text-white/50 text-xs mt-0.5">XP earned</div>
              </div>
              <div className="flex-1 min-w-[140px] self-end pb-1.5">
                <div className="bg-white/10 rounded-full h-1.5">
                  <div
                    className="bg-brand rounded-full h-1.5 transition-all duration-500"
                    style={{ width: `${(completedCount / totalCount) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      
      {/* Installation Guide */}
      <div className="bg-surface-card border border-black/10 rounded-2xl p-6 md:p-8">
        <h2 className="font-display text-2xl font-semibold mb-2">How to Install Sprekio</h2>
        <p className="text-ink/70 mb-6 text-sm md:text-base">
          Sprekio is a privacy-first Chrome Extension. It works completely locally without needing an account or login! Just build it and add your own AI API keys.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold shrink-0">1</div>
              <div>
                <h3 className="font-semibold">Build the Extension</h3>
                <p className="text-sm text-ink/60 mt-1">Open your terminal and run:</p>
                <code className="block bg-ink/5 p-2 rounded text-xs mt-2 font-mono">
                  cd "Chrome Extension"<br/>
                  npm install<br/>
                  npm run build
                </code>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold shrink-0">2</div>
              <div>
                <h3 className="font-semibold">Load into Chrome</h3>
                <p className="text-sm text-ink/60 mt-1">
                  Go to <code>chrome://extensions/</code>, enable <strong>Developer mode</strong>, click <strong>Load unpacked</strong>, and select the <code>dist</code> folder inside the Chrome Extension directory.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold shrink-0">3</div>
              <div>
                <h3 className="font-semibold">Bring Your Own Key</h3>
                <p className="text-sm text-ink/60 mt-1">
                  Go to any German YouTube video, click the Sprekio Settings Gear (⚙️) on the player, and enter your own <strong>Gemini</strong> or <strong>Nvidia</strong> API Key to unlock AI translation.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold shrink-0">✓</div>
              <div>
                <h3 className="font-semibold">No Login Required</h3>
                <p className="text-sm text-ink/60 mt-1">
                  Sprekio stores your vocabulary and reading progress entirely in your browser. You can start using it immediately—no account creation necessary!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
          <input
            type="text"
            placeholder="Search stories by title or topic..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/10 bg-surface-card text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setSelectedLevel(ALL)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
              selectedLevel === ALL
                ? "bg-brand text-white border-brand"
                : "bg-surface-card text-ink/60 border-black/10 hover:border-brand/40"
            )}
          >
            All levels
          </button>

          <button
            onClick={() => setReadFilter(readFilter === "unread" ? "all" : "unread")}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
              readFilter === "unread"
                ? "bg-ink text-white border-ink"
                : "bg-surface-card text-ink/60 border-black/10 hover:border-ink/30"
            )}
          >
            Unread
          </button>
          <button
            onClick={() => setReadFilter(readFilter === "read" ? "all" : "read")}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
              readFilter === "read"
                ? "bg-ink text-white border-ink"
                : "bg-surface-card text-ink/60 border-black/10 hover:border-ink/30"
            )}
          >
            Read
          </button>

          {CEFR_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setSelectedLevel(level)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                selectedLevel === level
                  ? "bg-brand text-white border-brand"
                  : "bg-surface-card text-ink/60 border-black/10 hover:border-brand/40"
              )}
            >
              {level} - {CEFR_DESCRIPTIONS[level]}
            </button>
          ))}
          <button
            onClick={() => setShowDialect(!showDialect)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
              showDialect
                ? "bg-brand text-white border-brand"
                : "bg-surface-card text-ink/60 border-black/10 hover:border-brand/40"
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
        <EmptyState
          icon={SearchX}
          title="No stories found"
          description="Try a different search term or clear your filters."
        />
      )}
    </div>
  );
}
