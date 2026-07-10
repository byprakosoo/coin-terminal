import { cn } from "@/lib/utils";

export function Progress({ value, className, indicatorClassName }: { value: number; className?: string; indicatorClassName?: string }) {
  return <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, value))}><div className={cn("h-full rounded-full bg-primary transition-[width]", indicatorClassName)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}
