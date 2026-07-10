import type { Metadata } from "next";
import { Toaster } from "sonner";
import { StoreHydrator } from "@/components/store-hydrator";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Coin Terminal",
    template: "%s · Coin Terminal",
  },
  description: "A private personal finance and Bitcoin research terminal.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <TooltipProvider delayDuration={250}>
          <StoreHydrator />
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "!border-border !bg-popover !text-popover-foreground",
                description: "!text-muted-foreground",
              },
            }}
          />
        </TooltipProvider>
      </body>
    </html>
  );
}
