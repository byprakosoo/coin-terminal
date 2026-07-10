"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Bitcoin,
  Bot,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { DemoBadge } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, initials, relativeTime } from "@/lib/utils";
import { useTerminalStore } from "@/store/terminal-store";

const navItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard, eyebrow: "Command center" },
  { href: "/portfolio", label: "Portfolio", icon: WalletCards, eyebrow: "Ledger & P&L" },
  { href: "/spending", label: "Spending", icon: CreditCard, eyebrow: "Cash flow" },
  { href: "/btc-research", label: "BTC Research", icon: Bitcoin, eyebrow: "Daily signal" },
  { href: "/smart-money", label: "Smart Money", icon: Sparkles, eyebrow: "Public-wallet proxy" },
  { href: "/ask-portfolio", label: "Ask Portfolio", icon: Bot, eyebrow: "Grounded assistant" },
  { href: "/settings", label: "Settings", icon: Settings, eyebrow: "Preferences" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const hydrated = useTerminalStore((state) => state.hydrated);
  const session = useTerminalStore((state) => state.session);
  const profile = useTerminalStore((state) => state.profile);
  const alerts = useTerminalStore((state) => state.alerts);
  const markAlertRead = useTerminalStore((state) => state.markAlertRead);
  const markAllAlertsRead = useTerminalStore((state) => state.markAllAlertsRead);
  const signOut = useTerminalStore((state) => state.signOut);
  const unreadCount = alerts.filter((alert) => !alert.readAt).length;
  const current = navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  useEffect(() => {
    if (!hydrated) return;
    if (!session) router.replace("/sign-in");
    else if (!profile.onboardingComplete) router.replace("/onboarding");
  }, [hydrated, profile.onboardingComplete, router, session]);

  if (!hydrated || !session || !profile.onboardingComplete) return <AppLoading />;

  const handleSignOut = async () => {
    await signOut();
    router.replace("/sign-in");
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className={cn("fixed inset-y-0 left-0 z-40 hidden border-r bg-[#090c11]/96 transition-[width] duration-200 lg:flex lg:flex-col", collapsed ? "w-[72px]" : "w-[244px]")}>
        <div className={cn("flex h-16 items-center border-b px-4", collapsed ? "justify-center" : "justify-between")}>
          <Brand compact={collapsed} />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Primary navigation">
          {navItems.slice(0, -1).map((item) => <NavItem key={item.href} {...item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} collapsed={collapsed} />)}
          <div className="mt-auto border-t pt-3">
            <NavItem {...navItems[navItems.length - 1]} active={pathname === "/settings"} collapsed={collapsed} />
          </div>
        </nav>
        <div className="border-t p-3">
          <Button variant="ghost" size={collapsed ? "icon" : "sm"} className={cn("text-muted-foreground", !collapsed && "w-full justify-start")} onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen /> : <><PanelLeftClose /><span>Collapse</span></>}
          </Button>
        </div>
      </aside>

      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-[244px]")}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/88 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu /></Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{current?.label ?? "Coin Terminal"}</p>
              <p className="hidden font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase sm:block">{current?.eyebrow ?? "Private research"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DemoBadge />
            <div className="hidden items-center gap-1.5 rounded-full border bg-card px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground md:flex"><span className="size-1.5 rounded-full bg-success shadow-[0_0_8px_rgb(66_213_165/0.7)]" />Backend connected</div>
            <Button variant="ghost" size="icon" className="relative" onClick={() => setAlertsOpen(true)} aria-label={`${unreadCount} unread alerts`}>
              <Bell />
              {unreadCount > 0 && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-risk text-[9px] font-semibold text-white ring-2 ring-background">{unreadCount}</span>}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="secondary" size="icon" className="rounded-full"><span className="text-[11px] font-semibold">{initials(profile.name)}</span></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel><span className="block truncate text-foreground">{profile.name}</span><span className="mt-0.5 block truncate font-normal">{profile.email}</span></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push("/settings")}><UserRound />Profile & preferences</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleSignOut()} destructive><LogOut />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">{children}</main>
        <footer className="mx-auto flex max-w-[1600px] flex-col gap-2 border-t px-4 py-5 text-[10px] tracking-wide text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>Coin Terminal · Private research workspace</span><span>Research only — not investment advice</span>
        </footer>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[min(88vw,19rem)] p-0">
          <SheetHeader className="sr-only"><SheetTitle>Navigation</SheetTitle><SheetDescription>Coin Terminal primary navigation</SheetDescription></SheetHeader>
          <div className="flex h-16 items-center border-b px-4"><Brand /></div>
          <nav className="space-y-1 p-3" aria-label="Mobile navigation">
            {navItems.map((item) => <NavItem key={item.href} {...item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} collapsed={false} onClick={() => setMobileOpen(false)} />)}
          </nav>
        </SheetContent>
      </Sheet>

      <Sheet open={alertsOpen} onOpenChange={setAlertsOpen}>
        <SheetContent>
          <SheetHeader><div className="flex items-center gap-2"><SheetTitle>Research alerts</SheetTitle>{unreadCount > 0 && <Badge variant="risk">{unreadCount} unread</Badge>}</div><SheetDescription>Risk warnings and observed research events.</SheetDescription></SheetHeader>
          <div className="mt-5 flex justify-end"><Button variant="ghost" size="sm" onClick={() => void markAllAlertsRead()} disabled={unreadCount === 0}>Mark all read</Button></div>
          <div className="mt-2 space-y-2">
            {alerts.map((alert) => (
              <button key={alert.id} onClick={() => { void markAlertRead(alert.id); if (alert.eventId) { setAlertsOpen(false); router.push(`/smart-money?event=${alert.eventId}`); } }} className={cn("w-full rounded-lg border p-3.5 text-left transition hover:bg-accent", !alert.readAt && "border-primary/25 bg-primary/[0.035]")}>
                <div className="flex items-start gap-3"><span className={cn("mt-1.5 size-2 shrink-0 rounded-full", alert.severity === "HIGH_RISK" ? "bg-risk" : alert.severity === "WARNING" ? "bg-warning" : "bg-info")} /><div><div className="flex items-center gap-2"><p className="text-sm font-medium">{alert.title}</p>{!alert.readAt && <span className="size-1.5 rounded-full bg-primary" />}</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{alert.description}</p><p className="mt-2 font-mono text-[10px] text-muted-foreground">{relativeTime(alert.createdAt)}</p></div></div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function NavItem({ href, label, icon: Icon, active, collapsed, onClick }: (typeof navItems)[number] & { active: boolean; collapsed: boolean; onClick?: () => void }) {
  const link = <Link href={href} onClick={onClick} className={cn("flex h-10 items-center gap-3 rounded-md px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground", collapsed && "justify-center px-0")}><Icon className="size-[17px] shrink-0" /><span className={cn(collapsed && "sr-only")}>{label}</span>{active && !collapsed && <ChevronRight className="ml-auto size-3.5" />}</Link>;
  if (!collapsed) return link;
  return <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>;
}

function AppLoading() {
  return <div className="flex min-h-screen"><div className="hidden w-[244px] border-r p-4 lg:block"><Skeleton className="h-8 w-36" /><div className="mt-10 space-y-3">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div></div><div className="flex-1"><div className="h-16 border-b" /><div className="mx-auto max-w-[1500px] space-y-5 p-6"><Skeleton className="h-20 w-full" /><div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32" />)}</div><Skeleton className="h-80" /></div></div></div>;
}
