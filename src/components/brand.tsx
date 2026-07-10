import Link from "next/link";
import { Bitcoin } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link href="/overview" className={cn("group flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary shadow-[0_0_22px_rgb(246_167_35/0.08)]">
        <Bitcoin className="size-[18px]" strokeWidth={2.2} />
        <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-success ring-2 ring-background" />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block text-sm font-semibold tracking-tight text-foreground">Coin Terminal</span>
          <span className="mt-1 block font-mono text-[9px] tracking-[0.15em] text-muted-foreground uppercase">Private Research</span>
        </span>
      )}
    </Link>
  );
}
