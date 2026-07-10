import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-border/75 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <p className="mb-2 font-mono text-[10px] font-semibold tracking-[0.18em] text-primary uppercase">{eyebrow}</p>}
        <h1 className="text-balance text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-[1.75rem]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ title, description, meta }: { title: string; description?: string; meta?: ReactNode }) {
  return <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold tracking-tight">{title}</h2>{description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}</div>{meta}</div>;
}

export function DemoBadge() {
  return <Badge variant="info" className="hidden sm:inline-flex">Authenticated</Badge>;
}
