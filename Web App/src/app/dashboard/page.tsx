"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { fetchVocabWords, FirestoreVocabWord } from "@/lib/vocab";
import { getDueCards } from "@/lib/srs";
import { deleteVocabularyWord, updateVocabularyWordStatus, loginWithGoogle } from "@/lib/firebase";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatPill } from "@/components/ui/StatPill";
import {
  Volume2, Trash2, Inbox, Video, Target, LayoutDashboard, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "vault" | "videos" | "quiz";

const GENDER_TONE: Record<string, { color: string }> = {
  der: { color: "#3b82f6" },
  die: { color: "#ef4444" },
  das: { color: "#22c55e" },
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: Tab = tabParam === "videos" ? "videos" : tabParam === "quiz" ? "quiz" : "vault";
  const setActiveTab = (tab: Tab) => router.replace(tab === "vault" ? "/dashboard" : `/dashboard?tab=${tab}`);

  const { user, loading: authLoading } = useAuth();
  const [words, setWords] = useState<FirestoreVocabWord[]>([]);
  const [wordsLoading, setWordsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWords([]);
      setWordsLoading(false);
      return;
    }
    setWordsLoading(true);
    fetchVocabWords(user.uid).then((w) => {
      setWords(w);
      setWordsLoading(false);
    });
  }, [user]);

  const playAudio = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    window.speechSynthesis.speak(utterance);
  };

  const dueCount = getDueCards(words).length;

  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "vault", label: "Vocab Vault", icon: LayoutDashboard },
    { id: "videos", label: "Watched Videos", icon: Video },
    { id: "quiz", label: "Quiz Arena", icon: Target },
  ];

  if (authLoading) {
    return <div className="min-h-[400px] flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
    </div>;
  }

  if (!user) {
    return (
      <Card className="min-h-[420px] flex flex-col items-center justify-center text-center p-8">
        <h2 className="font-display text-3xl font-semibold text-ink mb-3">Your Dashboard</h2>
        <p className="text-ink/50 mb-8 max-w-md">
          Sign in with the same Google account you use in the Sprekio Chrome extension to see
          every word you&apos;ve saved while watching YouTube, review it here, and quiz yourself on it.
        </p>
        <Button size="lg" onClick={() => loginWithGoogle()}>Sign in with Google</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink">Dashboard</h1>
        <p className="text-ink/50 text-sm mt-1">
          {words.length} word{words.length !== 1 ? "s" : ""} saved from the extension
          {dueCount > 0 && <> · <span className="text-brand font-semibold">{dueCount} due for review</span></>}
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
                active ? "bg-ink text-white" : "bg-surface-card text-ink/60 border border-black/5 hover:text-ink"
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {wordsLoading ? (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
        </div>
      ) : activeTab === "vault" ? (
        <VocabularyVault words={words} setWords={setWords} uid={user.uid} playAudio={playAudio} />
      ) : activeTab === "videos" ? (
        <VideoTracker words={words} />
      ) : (
        <QuizArena words={words} />
      )}
    </div>
  );
}

function VocabularyVault({
  words,
  setWords,
  uid,
  playAudio,
}: {
  words: FirestoreVocabWord[];
  setWords: React.Dispatch<React.SetStateAction<FirestoreVocabWord[]>>;
  uid: string;
  playAudio: (text: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "learning" | "learned">("all");

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this word completely?")) return;
    const res = await deleteVocabularyWord(uid, id);
    if (res.success) setWords((prev) => prev.filter((w) => w.id !== id));
    else alert("Failed to delete word: " + (res.error || "Unknown error"));
  };

  const handleUpdateStatus = async (id: string, status: "learning" | "learned") => {
    const res = await updateVocabularyWordStatus(uid, id, status);
    if (res.success) setWords((prev) => prev.map((w) => (w.id === id ? { ...w, status } : w)));
    else alert("Failed to update word status: " + (res.error || "Unknown error"));
  };

  if (words.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Your vault is empty"
        description="Save words while watching YouTube with the Sprekio extension and they'll show up here."
      />
    );
  }

  const learningWords = words.filter((w) => w.status !== "learned");
  const learnedWords = words.filter((w) => w.status === "learned");
  const displayedWords = filter === "all" ? words : filter === "learning" ? learningWords : learnedWords;

  // Group by source video — a word without a videoId (e.g. saved some other way)
  // falls into a final "Other words" bucket instead of being dropped.
  type Group = { videoId: string | null; videoTitle: string; lastSavedMs: number; words: FirestoreVocabWord[] };
  const groups = new Map<string, Group>();
  for (const w of displayedWords) {
    const key = w.videoId || "__none__";
    const timeMs = w.savedAt?.seconds ? w.savedAt.seconds * 1000 : 0;
    const existing = groups.get(key);
    if (existing) {
      existing.words.push(w);
      if (timeMs > existing.lastSavedMs) existing.lastSavedMs = timeMs;
    } else {
      groups.set(key, { videoId: w.videoId || null, videoTitle: w.videoTitle || "Unknown Video", lastSavedMs: timeMs, words: [w] });
    }
  }
  const orderedGroups = Array.from(groups.values()).sort((a, b) => b.lastSavedMs - a.lastSavedMs);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <div className="flex bg-black/5 rounded-lg p-1 gap-1 w-full sm:w-auto overflow-x-auto scrollbar-hide">
          {(["all", "learning", "learned"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 sm:flex-none px-4 py-1.5 rounded-md font-medium text-sm transition-colors whitespace-nowrap",
                filter === f ? "bg-surface-card text-ink shadow-sm" : "text-ink/50 hover:text-ink"
              )}
            >
              {f === "all" ? "All" : f === "learning" ? "Still Learning" : "Learned"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-8">
        {orderedGroups.map((group) => (
          <div key={group.videoId || "none"}>
            {/* Video header — the source video these words were saved from */}
            {group.videoId ? (
              <a 
                href={`https://www.youtube.com/watch?v=${group.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 mb-3 hover:opacity-80 transition-opacity group/video"
              >
                <div className="w-20 h-12 rounded-lg overflow-hidden bg-black/5 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image loader */}
                  <img
                    src={`https://img.youtube.com/vi/${group.videoId}/mqdefault.jpg`}
                    alt={group.videoTitle}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-ink truncate group-hover/video:text-brand transition-colors">
                    {group.videoTitle}
                  </h3>
                  <p className="text-xs text-ink/40">{group.words.length} word{group.words.length !== 1 ? "s" : ""} saved</p>
                </div>
              </a>
            ) : (
              <h3 className="text-sm font-semibold text-ink/50 mb-3">Other words</h3>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.words.map((w) => {
                const genderColor = w.gender ? GENDER_TONE[w.gender.toLowerCase()]?.color : undefined;
                return (
                  <Card key={w.id} className="group p-5 flex flex-col h-full">
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge color={genderColor}>{w.gender || w.partOfSpeech || "Word"}</Badge>
                        <Badge tone={w.status === "learned" ? "success" : "warning"}>
                          {w.status === "learned" ? "Learned" : "Learning"}
                        </Badge>
                      </div>

                      <div className="flex items-start justify-between gap-3 mb-1">
                        <h2 className="text-xl font-display font-semibold text-ink break-words flex-1 min-w-0 leading-tight">
                          {w.word}
                        </h2>
                        <button
                          onClick={() => playAudio(w.word)}
                          className="opacity-0 group-hover:opacity-100 text-brand bg-brand-light hover:bg-brand hover:text-white p-1.5 rounded-lg transition-all"
                          title="Play audio"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-base font-semibold text-brand-dark break-words leading-tight">{w.translation}</p>
                    </div>

                    <div className="mt-auto pt-4 border-t border-black/5">
                      {w.contextSentence && (
                        <p className="text-sm text-ink/60 italic line-clamp-3">&quot;{w.contextSentence}&quot;</p>
                      )}

                      <div className="flex gap-2 mt-3 h-0 overflow-hidden group-hover:h-9 opacity-0 group-hover:opacity-100 transition-all duration-300">
                        {w.status === "learned" ? (
                          <button
                            onClick={() => handleUpdateStatus(w.id, "learning")}
                            className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold rounded-xl border border-amber-200"
                          >
                            Mark as Learning
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(w.id, "learned")}
                            className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold rounded-xl border border-green-200"
                          >
                            Mark as Learned
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="w-9 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl border border-red-200 flex items-center justify-center shrink-0"
                          title="Delete completely"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoTracker({ words }: { words: FirestoreVocabWord[] }) {
  const videosMap = new Map<string, { title: string; count: number; id: string; lastSavedMs: number }>();

  words.forEach((w) => {
    if (w.videoId) {
      const timeMs = w.savedAt?.seconds ? w.savedAt.seconds * 1000 : 0;
      const existing = videosMap.get(w.videoId);
      if (existing) {
        existing.count += 1;
        if (timeMs > existing.lastSavedMs) existing.lastSavedMs = timeMs;
      } else {
        videosMap.set(w.videoId, { id: w.videoId, title: w.videoTitle || "Unknown Video", count: 1, lastSavedMs: timeMs });
      }
    }
  });

  const videos = Array.from(videosMap.values()).sort((a, b) => b.lastSavedMs - a.lastSavedMs);

  if (videos.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="No videos tracked yet"
        description="Save words while watching YouTube to build your video library."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {videos.map((v) => (
        <a 
          key={v.id} 
          href={`https://www.youtube.com/watch?v=${v.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block group/tracker hover:-translate-y-0.5 transition-transform"
        >
          <Card className="overflow-hidden flex h-full border-2 border-transparent group-hover/tracker:border-brand/20 group-hover/tracker:shadow-md transition-all">
            <div className="w-32 md:w-40 shrink-0 bg-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image loader */}
              <img
                src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`}
                alt={v.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-4 flex flex-col justify-center min-w-0">
              <h2 className="text-sm font-semibold text-ink leading-tight mb-2 line-clamp-2 group-hover/tracker:text-brand transition-colors">
                {v.title}
              </h2>
              <Badge tone="neutral" className="self-start">
                {v.count} word{v.count > 1 ? "s" : ""} learned
              </Badge>
            </div>
          </Card>
        </a>
      ))}
    </div>
  );
}

interface QuizQuestion {
  word: FirestoreVocabWord;
  options: FirestoreVocabWord[];
}

function QuizArena({ words }: { words: FirestoreVocabWord[] }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string>("all");

  const videosMap = new Map<string, string>();
  words.forEach((w) => {
    if (w.videoId) videosMap.set(w.videoId, w.videoTitle || "Unknown Video");
  });
  const videos = Array.from(videosMap.entries());

  const startQuiz = () => {
    const sourceWords = selectedVideo === "all" ? words : words.filter((w) => w.videoId === selectedVideo);

    if (sourceWords.length < 4) {
      alert("You need at least 4 saved words in this selection to play the Quiz Arena!");
      return;
    }

    const selectedWords: FirestoreVocabWord[] = [];
    const pool = [...sourceWords];

    while (selectedWords.length < Math.min(10, sourceWords.length) && pool.length > 0) {
      const totalWeight = pool.reduce((sum, w) => sum + (w.saveCount || 1), 0);
      let randomNum = Math.random() * totalWeight;
      let selectedIndex = 0;
      for (let i = 0; i < pool.length; i++) {
        randomNum -= pool[i].saveCount || 1;
        if (randomNum <= 0) {
          selectedIndex = i;
          break;
        }
      }
      selectedWords.push(pool[selectedIndex]);
      pool.splice(selectedIndex, 1);
    }

    const generated: QuizQuestion[] = selectedWords.map((wordObj) => {
      const wrong = words.filter((w) => w.id !== wordObj.id).sort(() => 0.5 - Math.random()).slice(0, 3);
      const options = [wordObj, ...wrong].sort(() => 0.5 - Math.random());
      return { word: wordObj, options };
    });

    setQuestions(generated);
    setCurrentIndex(0);
    setScore(0);
    setIsPlaying(true);
    setFeedback(null);
  };

  const handleAnswer = (selectedWordId: string) => {
    if (feedback !== null) return;
    const isCorrect = selectedWordId === questions[currentIndex].word.id;
    if (isCorrect) setScore((s) => s + 1);
    setFeedback(isCorrect ? "correct" : "incorrect");

    setTimeout(() => {
      setFeedback(null);
      if (currentIndex + 1 < questions.length) setCurrentIndex((c) => c + 1);
      else setIsPlaying(false);
    }, 1200);
  };

  if (!isPlaying) {
    return (
      <Card className="max-w-xl mx-auto p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-light flex items-center justify-center mx-auto mb-5">
          <Target className="w-7 h-7 text-brand" />
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink mb-2">Quiz Arena</h1>
        <p className="text-ink/50 mb-6">Words you save more often are more likely to come up.</p>

        <div className="mb-6 text-left bg-black/[0.03] p-4 rounded-2xl">
          <label className="block text-sm font-bold text-ink/70 mb-2">Quiz source</label>
          <select
            value={selectedVideo}
            onChange={(e) => setSelectedVideo(e.target.value)}
            className="w-full bg-surface-card border border-black/10 text-ink rounded-xl p-3 font-medium focus:outline-none focus:ring-2 focus:ring-brand/40"
          >
            <option value="all">🌍 Overall Vocabulary ({words.length} words)</option>
            {videos.map(([id, title]) => (
              <option key={id} value={id}>
                📺 {title.length > 50 ? title.slice(0, 50) + "..." : title}
              </option>
            ))}
          </select>
        </div>

        <Button size="lg" className="w-full" onClick={startQuiz}>
          Start Challenge
        </Button>
      </Card>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <StatPill icon={Layers} value={`${currentIndex + 1} / ${questions.length}`} tone="neutral" />
        <StatPill icon={Target} value={score} label="score" tone="brand" />
      </div>

      <Card
        className={cn(
          "p-8 md:p-12 text-center border-2 transition-colors",
          feedback === "correct" ? "border-green-400 bg-green-50" : feedback === "incorrect" ? "border-red-400 bg-red-50" : "border-transparent"
        )}
      >
        <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink mb-3">{currentQ.word.word}</h2>
        {currentQ.word.contextSentence && (
          <p className="text-sm text-ink/40 italic">&quot;{currentQ.word.contextSentence}&quot;</p>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {currentQ.options.map((opt) => {
          let cls = "bg-surface-card hover:bg-black/[0.03] border-2 border-black/10 text-ink";
          if (feedback !== null) {
            cls =
              opt.id === currentQ.word.id
                ? "bg-green-500 border-green-600 text-white"
                : "bg-black/5 border-black/5 text-ink/30";
          }
          return (
            <button
              key={opt.id}
              onClick={() => handleAnswer(opt.id)}
              className={cn("text-lg font-bold py-5 px-4 rounded-2xl transition-all", cls)}
            >
              {opt.translation}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-[400px]" />}>
      <DashboardContent />
    </Suspense>
  );
}
