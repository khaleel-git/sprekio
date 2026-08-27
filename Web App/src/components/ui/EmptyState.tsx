import { LucideIcon } from "lucide-react";
import { Button } from "./Button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-16 px-6">
      <div className="w-14 h-14 rounded-2xl bg-brand-light flex items-center justify-center">
        <Icon className="w-7 h-7 text-brand" />
      </div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      {description && <p className="text-sm text-ink/60 max-w-sm">{description}</p>}
      {action?.href ? (
        <Button href={action.href} size="sm" className="mt-2">
          {action.label}
        </Button>
      ) : action ? (
        <Button onClick={action.onClick} size="sm" className="mt-2">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
