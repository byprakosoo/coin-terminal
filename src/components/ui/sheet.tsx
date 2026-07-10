"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({ className, children, side = "right", ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "right" | "left" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/72 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 z-50 h-full w-[min(92vw,28rem)] overflow-y-auto border bg-popover p-5 shadow-2xl outline-none",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const SheetHeader = ({ className, ...props }: React.ComponentProps<"div">) => <div className={cn("flex flex-col gap-1.5 pr-7", className)} {...props} />;
export const SheetTitle = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) => <DialogPrimitive.Title className={cn("text-base font-semibold", className)} {...props} />;
export const SheetDescription = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) => <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
