import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({ label, value, detail, trend, trendDirection = "neutral", icon, className }: { label: string; value: string; detail?: string; trend?: string; trendDirection?: "up" | "down" | "neutral"; icon?: ReactNode; className?: string }) {
  const TrendIcon = trendDirection === "up" ? ArrowUpRight : trendDirection === "down" ? ArrowDownRight : Minus;
  return (
    <Card className={cn("min-w-0", className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          <span>{label}</span>{icon && <span className="text-muted-foreground/75 [&_svg]:size-4">{icon}</span>}
        </div>
        <p className="numeric mt-3 truncate text-xl font-semibold tracking-[-0.045em] sm:text-2xl">{value}</p>
        {(detail || trend) && <div className="mt-2 flex min-h-5 items-center gap-2 text-xs"><span className={cn("inline-flex items-center gap-0.5 font-mono", trendDirection === "up" ? "text-success" : trendDirection === "down" ? "text-risk" : "text-muted-foreground")}>{trend && <><TrendIcon className="size-3" />{trend}</>}</span>{detail && <span className="truncate text-muted-foreground">{detail}</span>}</div>}
      </CardContent>
    </Card>
  );
}
