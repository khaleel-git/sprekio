"use client";

import { useStore, LEVEL_NAMES, LEVEL_THRESHOLDS } from "@/lib/store";
import { stories } from "@/lib/stories";
import { Flame, Star, BookOpen, Brain, Trophy, Award } from "lucide-react";
import Link from "next/link";

const LEVEL_EMOJIS = ["🌱", "📖", "✏️", "🔍", "🎓", "💼", "🏆", "⭐", "🌟", "🦅"];

export default function ProfilePage() {
  const { progress, vocabDeck } = useStore();

  const levelName = LEVEL_NAMES[Math.min(progress.level - 1, LEVEL_NAMES.length - 1)];
  const levelEmoji = LEVEL_EMOJIS[Math.min(progress.level - 1, LEVEL_EMOJIS.length - 1)];

  const currentLevelXP = LEVEL_THRESHOLDS[Math.min(progress.level - 1, LEVEL_THRESHOLDS.length - 1)];
  const nextLevelXP = LEVEL_THRESHOLDS[Math.min(progress.level, LEVEL_THRESHOLDS.length - 1)];
  const xpInLevel = progress.xp - currentLevelXP;
  const xpNeeded = nextLevelXP - currentLevelXP;
  const levelProgress = Math.min(1, xpInLevel / xpNeeded);

  const completedStories = stories.filter((s) => progress.completedStories.includes(s.id));
  const vocabCount = vocabDeck.length;
  const reviewedCount = vocabDeck.filter((c) => c.repetitions > 0).length;

  const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

  return (
    <div className="space-y-6">
      {/* Level card */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-4xl">
            {levelEmoji}
          </div>
          <div className="flex-1">
            <p className="text-amber-100 text-sm">Level {progress.level}</p>
            <h2 className="text-2xl font-bold">{levelName}</h2>
            <p className="text-amber-100 text-xs mt-0.5">{progress.xp.toLocaleString()} XP total</p>
          </div>
        </div>

        {progress.level < 10 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-amber-100 mb-1">
              <span>Progress to Level {progress.level + 1}</span>
              <span>{xpInLevel} / {xpNeeded} XP</span>
            </div>
            <div className="bg-white/20 rounded-full h-3">
              <div
                className="bg-white rounded-full h-3 transition-all duration-500"
                style={{ width: `${levelProgress * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-5 h-5 text-orange-500" />
            <span className="font-semibold text-gray-700 text-sm">Streak</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{progress.streak}</div>
          <div className="text-xs text-gray-400">days in a row</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-yellow-500" />
            <span className="font-semibold text-gray-700 text-sm">Total XP</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{progress.xp.toLocaleString()}</div>
          <div className="text-xs text-gray-400">experience points</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-5 h-5 text-blue-500" />
            <span className="font-semibold text-gray-700 text-sm">Stories</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{completedStories.length}</div>
          <div className="text-xs text-gray-400">of {stories.length} completed</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-purple-500" />
            <span className="font-semibold text-gray-700 text-sm">Vocabulary</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{vocabCount}</div>
          <div className="text-xs text-gray-400">{reviewedCount} cards reviewed</div>
        </div>
      </div>

      {/* Streak milestones */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-500" />
          Streak Milestones
        </h3>
        <div className="flex items-end gap-3">
          {STREAK_MILESTONES.map((milestone) => {
            const achieved = progress.streak >= milestone;
            return (
              <div key={milestone} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-lg text-center py-1 text-xs font-bold transition-all ${
                    achieved
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-300"
                  }`}
                >
                  {achieved ? "🔥" : "·"}
                </div>
                <span className="text-xs text-gray-400">{milestone}d</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Completed stories */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500" />
          Completed Stories
        </h3>
        {completedStories.length > 0 ? (
          <div className="space-y-2">
            {completedStories.map((story) => (
              <Link
                key={story.id}
                href={`/story/${story.id}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <span className="text-xl">{story.imageEmoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{story.title}</p>
                  <p className="text-xs text-gray-400">{story.level} · {story.topic}</p>
                </div>
                <span className="text-green-500 text-xs font-medium">✓</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-400">
            <div className="text-3xl mb-2">📚</div>
            <p className="text-sm">No stories completed yet.</p>
            <Link href="/" className="text-sm text-blue-500 hover:underline mt-1 inline-block">
              Start reading →
            </Link>
          </div>
        )}
      </div>

      {/* Achievement badges (decorative) */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Award className="w-4 h-4 text-blue-500" />
          Achievement Badges
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { emoji: "🌱", label: "First Story", unlocked: completedStories.length >= 1 },
            { emoji: "📖", label: "5 Stories", unlocked: completedStories.length >= 5 },
            { emoji: "🔥", label: "3-day Streak", unlocked: progress.streak >= 3 },
            { emoji: "🧠", label: "10 Vocab", unlocked: vocabCount >= 10 },
            { emoji: "⭐", label: "100 XP", unlocked: progress.xp >= 100 },
            { emoji: "🏆", label: "500 XP", unlocked: progress.xp >= 500 },
            { emoji: "🎓", label: "B1 Story", unlocked: completedStories.some((s) => s.level === "B1") },
            { emoji: "🦅", label: "C2 Story", unlocked: completedStories.some((s) => s.level === "C2") },
          ].map((badge) => (
            <div
              key={badge.label}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl text-center transition-all ${
                badge.unlocked ? "opacity-100" : "opacity-30 grayscale"
              }`}
            >
              <div className="text-2xl">{badge.emoji}</div>
              <span className="text-xs text-gray-500 leading-tight">{badge.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
