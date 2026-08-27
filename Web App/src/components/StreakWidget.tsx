"use client";

import { useState, useRef, useEffect } from "react";
import { Flame, Star } from "lucide-react";
import { StatPill } from "./ui/StatPill";
import { cn } from "@/lib/utils";

interface StreakWidgetProps {
  streak: number;
  xp: number;
}

export default function StreakWidget({ streak, xp }: StreakWidgetProps) {
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
    <div className="flex items-center gap-2">
      <StatPill icon={Flame} value={streak} label="streak" tone="brand" className={cn(animate && "animate-bounce-subtle")} />
      <StatPill icon={Star} value={xp.toLocaleString()} label="XP" tone="neutral" />
    </div>
  );
}
