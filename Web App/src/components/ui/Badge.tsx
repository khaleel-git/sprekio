import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-black/5 text-ink/70 border-black/5",
  brand: "bg-brand-light text-brand-dark border-brand/20",
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
};

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Exact hex color for semantic categories with a fixed identity (grammar/CEFR), overrides `tone`. */
  color?: string;
}

export function Badge({ tone = "neutral", color, className, style, ...rest }: BadgeProps) {
  const colorStyle: React.CSSProperties | undefined = color
    ? {
        backgroundColor: hexToRgba(color, 0.12),
        color,
        borderColor: hexToRgba(color, 0.35),
      }
    : undefined;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        !color && tones[tone],
        className
      )}
      style={{ ...colorStyle, ...style }}
      {...rest}
    />
  );
}
