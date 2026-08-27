import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatPillProps {
  icon: LucideIcon;
  value: string | number;
  label?: string;
  tone?: "brand" | "neutral";
  className?: string;
}

export function StatPill({ icon: Icon, value, label, tone = "neutral", className }: StatPillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold",
        tone === "brand" ? "bg-brand-light text-brand-dark" : "bg-black/5 text-ink",
        className
      )}
      title={label}
    >
      <Icon className="w-4 h-4" />
      <span className="tabular-nums">{value}</span>
      {label && <span className="font-medium text-xs opacity-70 hidden sm:inline">{label}</span>}
    </div>
  );
}
