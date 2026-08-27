"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { getStoryById, XP_PER_STORY, CEFR_GRADIENTS } from "@/lib/stories";
import { useStore } from "@/lib/store";
import StoryReader from "@/components/StoryReader";
import QuizModal from "@/components/QuizModal";
import LevelBadge from "@/components/LevelBadge";
import { Card } from "@/components/ui/Card";
import { Clock, BookOpen, CheckCircle2, Brain, ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { use } from "react";

export default function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const story = getStoryById(id);
  if (!story) notFound();

  const [showQuiz, setShowQuiz] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [xpGained, setXpGained] = useState(0);
  const [activeTab, setActiveTab] = useState<"read" | "vocab" | "grammar">("read");

  const { completeStory, addWordToDeck, progress } = useStore();
  const isAlreadyCompleted = progress.completedStories.includes(story.id);
  const xpValue = XP_PER_STORY[story.level];

  const handleMarkComplete = () => {
    completeStory(story.id, xpValue);
    setCompleted(true);
    setXpGained(isAlreadyCompleted ? Math.floor(xpValue / 3) : xpValue);
  };

  const handleQuizFinish = (score: number) => {
    const bonusXP = score * 15;
    completeStory(story.id, xpValue + bonusXP);
    setXpGained(xpValue + bonusXP);
    setCompleted(true);
    setTimeout(() => setShowQuiz(false), 500);
  };

  const handleSaveAllVocab = () => {
    story.vocabulary.forEach((v) => {
      addWordToDeck(v.word, v.translation, story.id, story.title, v.example);
    });
  };

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to stories
        </Link>

        {/* Story header card */}
        <div className={cn("bg-gradient-to-br rounded-2xl p-6 text-white", CEFR_GRADIENTS[story.level])}>
          <div className="flex items-start gap-4">
            <div className="text-5xl">{story.imageEmoji}</div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <LevelBadge level={story.level} showDescription />
                {story.dialect && (
                  <span className="bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs font-medium">
                    {story.dialect === "Bayerisch" ? "🍺" : story.dialect === "Österreichisch" ? "🏔️" : "🧀"}{" "}
                    {story.dialect}
                  </span>
                )}
                {(isAlreadyCompleted || completed) && (
                  <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold mb-1">{story.title}</h1>
              <p className="text-sm text-white/80 mb-3">{story.description}</p>
              <div className="flex items-center gap-4 text-sm text-white/70">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {story.duration} min
                </span>
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" /> {story.topic}
                </span>
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> {xpValue} XP
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* XP gained toast */}
      {completed && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3 animate-slide-up">
          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white text-lg">
            ⭐
          </div>
          <div>
            <p className="font-bold text-green-800">
              +{xpGained} XP earned!
            </p>
            <p className="text-sm text-green-600">
              {isAlreadyCompleted ? "Review complete!" : "Story completed! Streak updated!"}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-black/5 rounded-xl p-1">
        {[
          { id: "read", label: "Read", icon: BookOpen },
          { id: "vocab", label: "Vocabulary", icon: Brain },
          { id: "grammar", label: "Grammar", icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-surface-card text-ink shadow-sm"
                  : "text-ink/50 hover:text-ink"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Read tab */}
      {activeTab === "read" && (
        <div className="space-y-4">
          <StoryReader story={story} />

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowQuiz(true)}
              className="flex-1 flex items-center justify-center gap-2 bg-ink text-white py-3 rounded-xl font-semibold hover:bg-ink/85 active:scale-95 transition-all"
            >
              <Brain className="w-4 h-4" />
              Take Quiz
            </button>
            <button
              onClick={handleMarkComplete}
              disabled={isAlreadyCompleted && completed}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold active:scale-95 transition-all",
                isAlreadyCompleted || completed
                  ? "bg-green-50 text-green-600 border border-green-200"
                  : "bg-green-600 text-white hover:bg-green-700"
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              {isAlreadyCompleted || completed ? "Completed ✓" : "Mark Complete"}
            </button>
          </div>
        </div>
      )}

      {/* Vocabulary tab */}
      {activeTab === "vocab" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">Key Vocabulary</h2>
            <button
              onClick={handleSaveAllVocab}
              className="text-xs text-brand font-medium hover:text-brand-dark flex items-center gap-1"
            >
              <Brain className="w-3.5 h-3.5" />
              Save all to deck
            </button>
          </div>
          {story.vocabulary.map((v, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-ink">{v.word}</p>
                  <p className="text-sm text-brand-dark font-medium">{v.translation}</p>
                  {v.example && <p className="text-xs text-ink/45 mt-1 italic">{v.example}</p>}
                </div>
                <button
                  onClick={() => addWordToDeck(v.word, v.translation, story.id, story.title, v.example)}
                  className="shrink-0 text-xs text-brand hover:text-brand-dark bg-brand-light hover:bg-brand/20 px-2 py-1 rounded-lg transition-colors"
                >
                  + Save
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Grammar tab */}
      {activeTab === "grammar" && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-bold text-ink mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" />
              Grammar Focus
            </h2>
            <p className="text-sm text-ink/70 leading-relaxed">{story.grammarFocus}</p>
          </Card>

          {/* Case color legend */}
          <Card className="p-5">
            <h3 className="font-semibold text-ink mb-3">Case Color Guide</h3>
            <div className="space-y-2">
              {[
                { case: "Nominativ", color: "bg-red-400", desc: "Subject – who does the action", example: "Der Mann schläft. (der = Nominativ)" },
                { case: "Akkusativ", color: "bg-blue-400", desc: "Direct object – what the action affects", example: "Ich sehe den Mann. (den = Akkusativ)" },
                { case: "Dativ", color: "bg-green-400", desc: "Indirect object – to/for whom", example: "Ich gebe dem Mann das Buch. (dem = Dativ)" },
                { case: "Genitiv", color: "bg-purple-400", desc: "Possession – whose", example: "Das Buch des Mannes. (des = Genitiv)" },
              ].map((c) => (
                <div key={c.case} className="flex items-start gap-3 p-3 rounded-xl bg-black/[0.03]">
                  <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${c.color}`} />
                  <div>
                    <p className="font-semibold text-sm text-ink/80">{c.case}</p>
                    <p className="text-xs text-ink/45">{c.desc}</p>
                    <p className="text-xs text-ink/35 italic mt-0.5">{c.example}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Quiz modal */}
      {showQuiz && (
        <QuizModal
          questions={story.quiz}
          storyTitle={story.title}
          onFinish={handleQuizFinish}
          onClose={() => setShowQuiz(false)}
        />
      )}
    </div>
  );
}
