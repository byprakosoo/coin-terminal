import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold tracking-[0.08em] uppercase whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/10 text-primary",
        neutral: "border-border bg-secondary text-muted-foreground",
        success: "border-success/25 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        risk: "border-risk/30 bg-risk/10 text-risk",
        info: "border-info/25 bg-info/10 text-info",
        outline: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
