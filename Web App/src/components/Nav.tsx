"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useStore, LEVEL_NAMES } from "@/lib/store";
import StreakWidget from "./StreakWidget";
import { BookOpen, Brain, Sparkles, Users, User, PlayCircle, Archive, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const mainNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Vocab Vault" },
  { href: "/dashboard?tab=videos", icon: PlayCircle, label: "Watched Videos" },
  { href: "/dashboard?tab=quiz", icon: Brain, label: "Quiz Arena" },
];

const secondaryNavItems = [
  { href: "/", icon: BookOpen, label: "Stories" },
  { href: "/watch", icon: PlayCircle, label: "YouTube Player" },
  { href: "/vocab", icon: Brain, label: "SRS Review" },
  { href: "/generate", icon: Sparkles, label: "Generate AI Stories" },
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
      {/* Desktop Sidebar Nav */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 fixed inset-y-0 left-0 z-40">
        <div className="p-6 pb-2">
          <Link href="/" className="flex items-center gap-2 mb-8">
            <span className="text-blue-600 font-bold text-2xl tracking-tighter">DE Sprekio</span>
          </Link>
          <div className="mb-4">
            <StreakWidget
              streak={progress.streak}
              xp={progress.xp}
              level={progress.level}
              levelName={levelName}
            />
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-8 overflow-y-auto mt-2">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-3">Dashboard</div>
            <div className="space-y-1">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || (item.href === '/watch' && pathname.startsWith('/watch'));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all",
                      active
                        ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-100"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-3">Learn</div>
            <div className="space-y-1">
              {secondaryNavItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                      active
                        ? "bg-gray-100 text-gray-900 shadow-sm border border-gray-200"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="px-4 h-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-blue-600 font-bold text-lg tracking-tighter">DE Sprekio</span>
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
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-40 overflow-x-auto">
        <div className="flex w-full min-w-max px-2">
          {[...mainNavItems, ...secondaryNavItems].map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 px-3 gap-1 text-[10px] font-medium transition-colors",
                  active ? "text-blue-600" : "text-gray-400"
                )}
              >
                <Icon className={cn("w-5 h-5", active && "scale-110 transition-transform")} />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
