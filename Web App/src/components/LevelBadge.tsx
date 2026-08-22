import { CEFRLevel, CEFR_COLORS, CEFR_DESCRIPTIONS } from "@/lib/stories";
import { cn } from "@/lib/utils";

interface LevelBadgeProps {
  level: CEFRLevel;
  showDescription?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function LevelBadge({
  level,
  showDescription = false,
  size = "md",
}: LevelBadgeProps) {
  const sizeClass = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-xs px-2.5 py-1",
    lg: "text-sm px-3 py-1.5",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold",
        CEFR_COLORS[level],
        sizeClass
      )}
    >
      {level}
      {showDescription && (
        <span className="font-normal opacity-75">
          · {CEFR_DESCRIPTIONS[level]}
        </span>
      )}
    </span>
  );
}
