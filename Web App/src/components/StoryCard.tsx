"use client";

import Link from "next/link";
import { Story, CEFR_GRADIENTS } from "@/lib/stories";
import { useStore } from "@/lib/store";
import LevelBadge from "./LevelBadge";
import { Card } from "./ui/Card";
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

  return (
    <Link href={`/story/${story.id}`}>
      <Card interactive className="overflow-hidden group relative">
        {/* Level-coded header — color tells you the difficulty at a glance */}
        <div className={cn("bg-gradient-to-br p-5 text-white relative", CEFR_GRADIENTS[story.level])}>
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

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-display font-semibold text-ink text-base leading-tight group-hover:text-brand transition-colors line-clamp-2">
              {story.title}
            </h3>
            <LevelBadge level={story.level} size="sm" />
          </div>

          <p className="text-xs text-ink/50 line-clamp-2 mb-3">{story.description}</p>

          <div className="flex items-center justify-between text-xs text-ink/40">
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
                isUpvoted ? "text-brand" : "text-ink/30 hover:text-brand"
              )}
            >
              <Heart className="w-3.5 h-3.5" fill={isUpvoted ? "currentColor" : "none"} />
              <span>{story.upvotes + (isUpvoted ? 1 : 0)}</span>
            </button>
          </div>
        </div>

        {isCompleted && <div className="absolute inset-x-0 bottom-0 h-1 bg-brand" />}
      </Card>
    </Link>
  );
}
