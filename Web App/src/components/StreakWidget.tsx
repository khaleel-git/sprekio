"use client";

import { useState, useRef, useEffect } from "react";
import { Flame, Star } from "lucide-react";

interface StreakWidgetProps {
  streak: number;
  xp: number;
  level: number;
  levelName: string;
}

export default function StreakWidget({ streak, xp, level, levelName }: StreakWidgetProps) {
  const [animate, setAnimate] = useState(false);
  const prevStreak = useRef(streak);

  useEffect(() => {
    if (streak !== prevStreak.current) {
      setAnimate(true);
      setTimeout(() => setAnimate(false), 600);
      prevStreak.current = streak;
    }
  }, [streak]);

  return (
    <div className="flex items-center gap-3">
      {/* Streak */}
      <div
        className={`flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5 ${
          animate ? "animate-bounce-subtle" : ""
        }`}
      >
        <Flame className="w-4 h-4 text-orange-500" />
        <span className="text-sm font-bold text-orange-700">{streak}</span>
        <span className="text-xs text-orange-500">streak</span>
      </div>

      {/* XP / Level */}
      <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1.5">
        <Star className="w-4 h-4 text-yellow-500" />
        <span className="text-sm font-bold text-yellow-700">{xp.toLocaleString()}</span>
        <span className="text-xs text-yellow-600">XP</span>
      </div>
    </div>
  );
}
