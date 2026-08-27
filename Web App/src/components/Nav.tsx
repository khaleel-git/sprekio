"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/useAuth";
import { loginWithGoogle, logout } from "@/lib/firebase";
import { BookOpen, Brain, User, LayoutDashboard, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const mainNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
];

const learnNavItems = [
  { href: "/", icon: BookOpen, label: "Stories" },
  { href: "/vocab", icon: Brain, label: "Vocab Review" },
  { href: "/profile", icon: User, label: "Profile" },
];

// Four pages total — all fit directly in the mobile bottom bar, no "More" overflow needed.
const mobilePrimary = [
  { href: "/", icon: BookOpen, label: "Stories" },
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/vocab", icon: Brain, label: "Review" },
  { href: "/profile", icon: User, label: "Profile" },
];

function isActive(pathname: string, href: string) {
  return pathname === href;
}

function AuthBlock({ compact }: { compact?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) return <div className={cn("bg-black/5 rounded-xl animate-pulse", compact ? "w-8 h-8 rounded-full" : "h-11")} />;

  if (!user) {
    return (
      <button
        onClick={() => loginWithGoogle()}
        className={cn(
          "flex items-center justify-center gap-2 text-sm font-semibold rounded-xl border border-brand text-brand bg-brand-light hover:bg-brand hover:text-white transition-colors",
          compact ? "w-8 h-8 rounded-full p-0" : "w-full py-2.5"
        )}
        title="Sign in with Google"
      >
        {compact ? <User className="w-4 h-4" /> : "Sign in with Google"}
      </button>
    );
  }

  if (compact) {
    return user.photoURL ? (
      // eslint-disable-next-line @next/next/no-img-element -- static export has no image loader; a 32px avatar doesn't need one anyway
      <img src={user.photoURL} alt={user.displayName || "Account"} width={32} height={32} className="rounded-full" />
    ) : (
      <div className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-sm font-bold">
        {(user.displayName || "?")[0]}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-1">
      {user.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoURL} alt={user.displayName || "Account"} width={32} height={32} className="rounded-full shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-sm font-bold shrink-0">
          {(user.displayName || "?")[0]}
        </div>
      )}
      <span className="text-sm font-semibold text-ink truncate flex-1">{user.displayName}</span>
      <button onClick={() => logout()} title="Sign out" className="text-ink/40 hover:text-ink shrink-0">
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const { loadFromStorage } = useStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <>
      {/* Desktop Sidebar Nav */}
      <aside className="hidden md:flex flex-col w-64 bg-surface-card border-r border-black/5 fixed inset-y-0 left-0 z-40">
        <div className="p-6 pb-2">
          <Link href="/" className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand" />
            <span className="font-display text-ink font-semibold text-2xl tracking-tight">Sprekio</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-8 overflow-y-auto mt-2">
          <div>
            <div className="text-xs font-bold text-ink/40 uppercase tracking-wider mb-3 px-3">Dashboard</div>
            <div className="space-y-1">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors",
                      active
                        ? "bg-brand-light text-brand-dark border border-brand/20"
                        : "text-ink/60 hover:text-ink hover:bg-black/5"
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
            <div className="text-xs font-bold text-ink/40 uppercase tracking-wider mb-3 px-3">Learn</div>
            <div className="space-y-1">
              {learnNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                      active
                        ? "bg-black/5 text-ink"
                        : "text-ink/60 hover:text-ink hover:bg-black/5"
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

        <div className="p-4 border-t border-black/5">
          <AuthBlock />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden bg-surface-card border-b border-black/5 sticky top-0 z-40">
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-brand" />
            <span className="font-display text-ink font-semibold text-lg tracking-tight">Sprekio</span>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <AuthBlock compact />
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-surface-card border-t border-black/5 z-40">
        <div className="flex w-full">
          {mobilePrimary.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 gap-1 text-[10px] font-medium transition-colors",
                  active ? "text-brand" : "text-ink/40"
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
