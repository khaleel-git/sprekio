"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useStore, LEVEL_NAMES } from "@/lib/store";
import StreakWidget from "./StreakWidget";
import { BookOpen, Brain, Sparkles, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: BookOpen, label: "Stories" },
  { href: "/vocab", icon: Brain, label: "Vocab" },
  { href: "/generate", icon: Sparkles, label: "Generate" },
  { href: "/community", icon: Users, label: "Community" },
  { href: "/profile", icon: User, label: "Profile" },
];

export default function Nav() {
  const pathname = usePathname();
  const { progress, loadFromStorage } = useStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const levelName = LEVEL_NAMES[Math.min(progress.level - 1, LEVEL_NAMES.length - 1)];

  return (
    <>
      {/* Desktop top nav */}
      <header className="hidden md:block bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🇩🇪</span>
            <span className="font-bold text-gray-900">Sprekio</span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <StreakWidget
            streak={progress.streak}
            xp={progress.xp}
            level={progress.level}
            levelName={levelName}
          />
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="md:hidden bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="px-4 h-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">🇩🇪</span>
            <span className="font-bold text-sm text-gray-900">Sprekio</span>
          </Link>
          <StreakWidget
            streak={progress.streak}
            xp={progress.xp}
            level={progress.level}
            levelName={levelName}
          />
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-40">
        <div className="flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors",
                  active ? "text-blue-600" : "text-gray-400"
                )}
              >
                <Icon className={cn("w-5 h-5", active && "scale-110 transition-transform")} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
