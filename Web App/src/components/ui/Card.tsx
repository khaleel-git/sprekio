import { cn } from "@/lib/utils";

export function Card({
  className,
  interactive,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "bg-surface-card rounded-2xl border border-black/5 shadow-[0_1px_2px_rgba(23,18,14,0.04),0_8px_24px_-12px_rgba(23,18,14,0.12)]",
        interactive && "transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(23,18,14,0.04),0_16px_32px_-12px_rgba(23,18,14,0.18)] cursor-pointer",
        className
      )}
      {...rest}
    />
  );
}
