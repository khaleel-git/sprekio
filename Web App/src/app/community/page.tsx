"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Users, Heart, PlusCircle, BookOpen, X, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { CEFR_LEVELS, CEFRLevel } from "@/lib/stories";

const SAMPLE_COMMUNITY: any[] = [
  {
    id: "comm-1",
    title: "Meine Katze Otto",
    titleEn: "My Cat Otto",
    level: "A1",
    topic: "Animals",
    author: "Hannah_B",
    content: "Ich habe eine Katze. Sie heißt Otto. Otto ist schwarz und weiß. Otto schläft gern auf dem Sofa. Am Morgen miaut Otto laut. Er will Frühstück!",
    upvotes: 23,
    createdAt: "2025-06-10T10:00:00Z",
  },
  {
    id: "comm-2",
    title: "Ein Tag im Supermarkt",
    titleEn: "A Day at the Supermarket",
    level: "A2",
    topic: "Daily Life",
    author: "Marco_DE",
    content: "Jeden Samstag gehe ich in den Supermarkt. Ich kaufe Brot, Milch, Käse und Obst. Heute gibt es Äpfel im Angebot – ein Kilogramm für nur 99 Cent! Die Kassiererin ist immer freundlich und wünscht mir einen schönen Tag.",
    upvotes: 41,
    createdAt: "2025-07-22T14:00:00Z",
  },
  {
    id: "comm-3",
    title: "Das Fahrrad und die Freiheit",
    titleEn: "The Bicycle and Freedom",
    level: "B1",
    topic: "Lifestyle",
    author: "Cycle_Heike",
    content: "In Deutschland fahren viele Menschen mit dem Fahrrad zur Arbeit. Ich auch. Es gibt ausgezeichnete Fahrradwege in meiner Stadt. Im Sommer ist es wunderbar, mit dem Wind im Gesicht durch die Stadt zu radeln. Im Winter wird es schwieriger, aber mit der richtigen Kleidung ist es machbar.",
    upvotes: 67,
    createdAt: "2025-08-01T09:00:00Z",
  },
];

export default function CommunityPage() {
  const { progress, submitCommunityStory, upvoteCommunityStory } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", titleEn: "", level: "A1" as CEFRLevel, topic: "", author: "", content: "" });
  const [submitted, setSubmitted] = useState(false);
  const [upvotedIds, setUpvotedIds] = useState<Set<string>>(new Set());

  const allStories = [...SAMPLE_COMMUNITY, ...progress.communityStories];

  const handleSubmit = () => {
    if (!form.title || !form.content || !form.author) return;
    submitCommunityStory(form);
    setSubmitted(true);
    setShowForm(false);
    setForm({ title: "", titleEn: "", level: "A1", topic: "", author: "", content: "" });
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleUpvote = (id: string, isUserStory: boolean) => {
    if (upvotedIds.has(id)) return;
    setUpvotedIds((prev) => new Set([...prev, id]));
    if (isUserStory) {
      upvoteCommunityStory(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-pink-600 to-rose-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6" />
            <div>
              <h1 className="text-xl font-bold">Community Stories</h1>
              <p className="text-pink-100 text-sm">{allStories.length} stories from learners worldwide</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl px-3 py-2 text-sm font-medium transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            Submit
          </button>
        </div>
      </div>

      {/* Success toast */}
      {submitted && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 flex items-center gap-2 animate-slide-up">
          ✅ Your story was submitted! You earned +50 XP.
        </div>
      )}

      {/* Stories */}
      <div className="space-y-4">
        {allStories.map((story) => {
          const isUser = story.id.startsWith("community-");
          const isUpvoted = upvotedIds.has(story.id);
          return (
            <div key={story.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">
                      {story.level}
                    </span>
                    {story.topic && (
                      <span className="text-xs text-gray-400">{story.topic}</span>
                    )}
                    {isUser && (
                      <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Your story</span>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900">{story.title}</h3>
                  {story.titleEn && (
                    <p className="text-xs text-gray-400">{story.titleEn}</p>
                  )}
                </div>
                <button
                  onClick={() => handleUpvote(story.id, isUser)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 p-2 rounded-xl border transition-all",
                    isUpvoted
                      ? "bg-pink-50 border-pink-200 text-pink-600"
                      : "bg-gray-50 border-gray-100 text-gray-400 hover:border-pink-300 hover:text-pink-500"
                  )}
                >
                  <ChevronUp className="w-4 h-4" />
                  <span className="text-xs font-bold">{story.upvotes + (isUpvoted ? 1 : 0)}</span>
                </button>
              </div>

              <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">
                {story.content}
              </p>

              <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                <span>by @{story.author}</span>
                <span>·</span>
                <span>{new Date(story.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Submit a Story</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Your name / username</label>
                <input
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                  placeholder="e.g. Anna_Wien"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Title (German)</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                  placeholder="e.g. Mein Urlaub in Wien"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Title (English)</label>
                <input
                  value={form.titleEn}
                  onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                  placeholder="e.g. My Holiday in Vienna"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">CEFR Level</label>
                  <select
                    value={form.level}
                    onChange={(e) => setForm({ ...form, level: e.target.value as CEFRLevel })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                  >
                    {CEFR_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Topic</label>
                  <input
                    value={form.topic}
                    onChange={(e) => setForm({ ...form, topic: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                    placeholder="Travel, Food…"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Your story (in German)</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={6}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                  placeholder="Schreib deine Geschichte auf Deutsch…"
                />
              </div>
              <button
                onClick={handleSubmit}
                disabled={!form.title || !form.content || !form.author}
                className="w-full bg-pink-600 text-white py-3 rounded-xl font-semibold hover:bg-pink-700 disabled:bg-gray-200 disabled:text-gray-400 transition-all"
              >
                Submit Story (+50 XP)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
