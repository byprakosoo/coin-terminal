import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <div className="relative w-full overflow-x-auto"><table className={cn("w-full caption-bottom text-sm", className)} {...props} /></div>;
}
export const TableHeader = ({ className, ...props }: React.ComponentProps<"thead">) => <thead className={cn("[&_tr]:border-b", className)} {...props} />;
export const TableBody = ({ className, ...props }: React.ComponentProps<"tbody">) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
export const TableRow = ({ className, ...props }: React.ComponentProps<"tr">) => <tr className={cn("border-b transition-colors hover:bg-muted/45 data-[state=selected]:bg-muted", className)} {...props} />;
export const TableHead = ({ className, ...props }: React.ComponentProps<"th">) => <th className={cn("h-10 px-3 text-left align-middle text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase whitespace-nowrap", className)} {...props} />;
export const TableCell = ({ className, ...props }: React.ComponentProps<"td">) => <td className={cn("px-3 py-3 align-middle", className)} {...props} />;
