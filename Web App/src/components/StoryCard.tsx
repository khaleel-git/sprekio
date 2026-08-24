"use client";

import Link from "next/link";
import { Story } from "@/lib/stories";
import { useStore } from "@/lib/store";
import LevelBadge from "./LevelBadge";
import { Clock, Heart, BookOpen, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StoryCardProps {
  story: Story;
}

export default function StoryCard({ story }: StoryCardProps) {
  const { progress, upvoteStory } = useStore();
  const isCompleted = progress.completedStories.includes(story.id);
  const isUpvoted = progress.upvotedStories.includes(story.id);

  const handleUpvote = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    upvoteStory(story.id);
  };

  const isGenerated = story.id.startsWith("gen-");
  const href = isGenerated ? `/story/generated?id=${story.id}` : `/story/${story.id}`;

  return (
    <Link href={href}>
      <div
        className={cn(
          "group relative bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden",
          "hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
        )}
      >
        {/* Color Header */}
        <div className={`bg-gradient-to-br ${story.color} p-5 text-white relative`}>
          <div className="text-4xl mb-2">{story.imageEmoji}</div>
          {isCompleted && (
            <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm rounded-full p-1">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
          )}
          {story.dialect && (
            <div className="absolute bottom-3 right-3 bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs font-medium">
              {story.dialect === "Bayerisch" ? "🍺" : story.dialect === "Österreichisch" ? "🏔️" : "🧀"}{" "}
              {story.dialect}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-bold text-gray-900 text-sm leading-tight group-hover:text-blue-600 transition-colors line-clamp-2">
              {story.title}
            </h3>
            <LevelBadge level={story.level} size="sm" />
          </div>

          <p className="text-xs text-gray-500 line-clamp-2 mb-3">
            {story.description}
          </p>

          <div className="flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {story.duration} min
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                {story.topic}
              </span>
            </div>
            <button
              onClick={handleUpvote}
              className={cn(
                "flex items-center gap-1 transition-colors",
                isUpvoted ? "text-red-500" : "text-gray-400 hover:text-red-400"
              )}
            >
              <Heart
                className="w-3.5 h-3.5"
                fill={isUpvoted ? "currentColor" : "none"}
              />
              <span>{story.upvotes + (isUpvoted ? 1 : 0)}</span>
            </button>
          </div>
        </div>

        {/* Completed overlay */}
        {isCompleted && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-green-400 to-emerald-500" />
        )}
      </div>
    </Link>
  );
}
