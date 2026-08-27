"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useStore, LEVEL_NAMES, LEVEL_THRESHOLDS, UserProgress } from "@/lib/store";
import { getOrCreateProfile, touchStreak, CloudProgress } from "@/lib/profile";
import { fetchVocabWords } from "@/lib/vocab";
import { stories } from "@/lib/stories";
import { Card } from "@/components/ui/Card";
import { Flame, Star, BookOpen, Brain, Trophy, Award } from "lucide-react";
import Link from "next/link";

const LEVEL_EMOJIS = ["🌱", "📖", "✏️", "🔍", "🎓", "💼", "🏆", "⭐", "🌟", "🦅"];

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const localStore = useStore();

  const [cloud, setCloud] = useState<CloudProgress | null>(null);
  const [vocabCount, setVocabCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [cloudLoading, setCloudLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setCloudLoading(false);
      return;
    }
    setCloudLoading(true);
    (async () => {
      const profile = await touchStreak(user.uid, await getOrCreateProfile(user.uid));
      setCloud(profile);
      const words = await fetchVocabWords(user.uid);
      setVocabCount(words.length);
      setReviewedCount(words.filter((w) => w.repetitions > 0).length);
      setCloudLoading(false);
    })();
  }, [user]);

  const progress: UserProgress = user && cloud ? cloud : localStore.progress;
  const deckCount = user ? vocabCount : localStore.vocabDeck.length;
  const deckReviewedCount = user ? reviewedCount : localStore.vocabDeck.filter((c) => c.repetitions > 0).length;

  if (authLoading || (user && cloudLoading)) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  const levelName = LEVEL_NAMES[Math.min(progress.level - 1, LEVEL_NAMES.length - 1)];
  const levelEmoji = LEVEL_EMOJIS[Math.min(progress.level - 1, LEVEL_EMOJIS.length - 1)];

  const currentLevelXP = LEVEL_THRESHOLDS[Math.min(progress.level - 1, LEVEL_THRESHOLDS.length - 1)];
  const nextLevelXP = LEVEL_THRESHOLDS[Math.min(progress.level, LEVEL_THRESHOLDS.length - 1)];
  const xpInLevel = progress.xp - currentLevelXP;
  const xpNeeded = nextLevelXP - currentLevelXP;
  const levelProgress = Math.min(1, xpInLevel / xpNeeded);

  const completedStories = stories.filter((s) => progress.completedStories.includes(s.id));

  const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

  return (
    <div className="space-y-6">
      {/* Level card */}
      <div className="relative overflow-hidden rounded-2xl bg-ink text-white p-6">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-brand/25 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-4">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-4xl shrink-0">
            {levelEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-brand text-sm font-semibold">Level {progress.level}</p>
            <h2 className="font-display text-2xl font-semibold truncate">{levelName}</h2>
            <p className="text-white/50 text-xs mt-0.5">{progress.xp.toLocaleString()} XP total</p>
          </div>
        </div>

        {progress.level < 10 && (
          <div className="relative mt-5">
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>Progress to Level {progress.level + 1}</span>
              <span>{xpInLevel} / {xpNeeded} XP</span>
            </div>
            <div className="bg-white/10 rounded-full h-2.5">
              <div className="bg-brand rounded-full h-2.5 transition-all duration-500" style={{ width: `${levelProgress * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {!user && (
        <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-ink/60">Sign in to sync your progress across devices and with the extension.</p>
          <Link href="/dashboard" className="text-sm font-semibold text-brand hover:text-brand-dark shrink-0">
            Sign in →
          </Link>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-5 h-5 text-brand" />
            <span className="font-semibold text-ink/70 text-sm">Streak</span>
          </div>
          <div className="text-3xl font-bold text-ink">{progress.streak}</div>
          <div className="text-xs text-ink/35">days in a row</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-amber-500" />
            <span className="font-semibold text-ink/70 text-sm">Total XP</span>
          </div>
          <div className="text-3xl font-bold text-ink">{progress.xp.toLocaleString()}</div>
          <div className="text-xs text-ink/35">experience points</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-5 h-5 text-blue-500" />
            <span className="font-semibold text-ink/70 text-sm">Stories</span>
          </div>
          <div className="text-3xl font-bold text-ink">{completedStories.length}</div>
          <div className="text-xs text-ink/35">of {stories.length} completed</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-brand" />
            <span className="font-semibold text-ink/70 text-sm">Vocabulary</span>
          </div>
          <div className="text-3xl font-bold text-ink">{deckCount}</div>
          <div className="text-xs text-ink/35">{deckReviewedCount} cards reviewed</div>
        </Card>
      </div>

      {/* Streak milestones */}
      <Card className="p-5">
        <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
          <Flame className="w-4 h-4 text-brand" />
          Streak Milestones
        </h3>
        <div className="flex items-end gap-3">
          {STREAK_MILESTONES.map((milestone) => {
            const achieved = progress.streak >= milestone;
            return (
              <div key={milestone} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-lg text-center py-1 text-xs font-bold transition-all ${
                    achieved ? "bg-brand-light text-brand-dark" : "bg-black/5 text-ink/20"
                  }`}
                >
                  {achieved ? "🔥" : "·"}
                </div>
                <span className="text-xs text-ink/35">{milestone}d</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Completed stories */}
      <Card className="p-5">
        <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          Completed Stories
        </h3>
        {completedStories.length > 0 ? (
          <div className="space-y-2">
            {completedStories.map((story) => (
              <Link
                key={story.id}
                href={`/story/${story.id}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-black/[0.03] transition-colors"
              >
                <span className="text-xl">{story.imageEmoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-ink truncate">{story.title}</p>
                  <p className="text-xs text-ink/35">{story.level} · {story.topic}</p>
                </div>
                <span className="text-green-500 text-xs font-medium">✓</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-ink/35">
            <div className="text-3xl mb-2">📚</div>
            <p className="text-sm">No stories completed yet.</p>
            <Link href="/" className="text-sm text-brand hover:underline mt-1 inline-block">
              Start reading →
            </Link>
          </div>
        )}
      </Card>

      {/* Achievement badges */}
      <Card className="p-5">
        <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
          <Award className="w-4 h-4 text-blue-500" />
          Achievement Badges
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { emoji: "🌱", label: "First Story", unlocked: completedStories.length >= 1 },
            { emoji: "📖", label: "5 Stories", unlocked: completedStories.length >= 5 },
            { emoji: "🔥", label: "3-day Streak", unlocked: progress.streak >= 3 },
            { emoji: "🧠", label: "10 Vocab", unlocked: deckCount >= 10 },
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
              <span className="text-xs text-ink/50 leading-tight">{badge.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
