"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Globe2, ShieldCheck, WalletCards } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isValidTimezone } from "@/lib/format";
import type { DisplayCurrency } from "@/lib/types";
import { useTerminalStore } from "@/store/terminal-store";

export function OnboardingPage() {
  const router = useRouter();
  const hydrated = useTerminalStore((state) => state.hydrated);
  const session = useTerminalStore((state) => state.session);
  const profile = useTerminalStore((state) => state.profile);
  const completeOnboarding = useTerminalStore((state) => state.completeOnboarding);
  const [step, setStep] = useState(1);
  const [accepted, setAccepted] = useState(false);
  const [name, setName] = useState(profile.name);
  const [timezone, setTimezone] = useState(profile.timezone || "UTC");
  const [currency, setCurrency] = useState<DisplayCurrency>(profile.displayCurrency);
  const [timezoneError, setTimezoneError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) router.replace("/sign-in");
    else if (profile.onboardingComplete) router.replace("/overview");
  }, [hydrated, profile.onboardingComplete, router, session]);

  const finish = async () => {
    if (!isValidTimezone(timezone)) {
      setTimezoneError("Enter a valid IANA timezone, for example Asia/Jakarta.");
      setStep(2);
      return;
    }
    setSubmitting(true);
    try {
      await completeOnboarding({ name: name.trim() || "User", timezone, displayCurrency: currency });
      router.push("/overview");
    } catch (error) {
      setTimezoneError(error instanceof Error ? error.message : "Setup could not be saved.");
      setStep(2);
      setSubmitting(false);
    }
  };

  if (!hydrated || !session || profile.onboardingComplete) return null;

  return (
    <main className="terminal-grid flex min-h-screen flex-col">
      <header className="flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur sm:px-8"><Brand /><span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">Setup {step} / 3</span></header>
      <div className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-10">
        <div className="w-full">
          <div className="mb-7 flex gap-1.5">{[1, 2, 3].map((value) => <div key={value} className={`h-1 flex-1 rounded-full ${value <= step ? "bg-primary" : "bg-secondary"}`} />)}</div>
          <Card className="bg-card/90 shadow-2xl shadow-black/25">
            <CardContent className="p-6 sm:p-9">
              {step === 1 && <div><StepIcon icon={ShieldCheck} /><p className="mt-5 font-mono text-[10px] tracking-[0.18em] text-primary uppercase">Research boundaries</p><h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Know what this terminal is—and is not.</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Coin Terminal organizes personal records and presents explainable research signals. It does not execute trades, hold funds, verify wallet identity, or promise profitable results.</p><div className="mt-6 space-y-3 rounded-lg border bg-background/50 p-4 text-sm text-muted-foreground">{["Signals are deterministic research labels, not instructions.", "Smart-money labels use public-wallet proxies and may be wrong.", "Private records are scoped to your authenticated account."].map((text) => <div key={text} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-success" /><span>{text}</span></div>)}</div><label className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg border p-4"><Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} /><span className="text-sm leading-relaxed">I understand this is research only and not investment advice.</span></label></div>}
              {step === 2 && <div><StepIcon icon={Globe2} /><p className="mt-5 font-mono text-[10px] tracking-[0.18em] text-primary uppercase">Display preferences</p><h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Make the numbers yours.</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Raw timestamps remain UTC; your selected timezone and currency control how the interface displays them.</p><div className="mt-7 grid gap-5 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="name">Display name</Label><Input id="name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="space-y-2"><Label>Display currency</Label><Select value={currency} onValueChange={(value) => setCurrency(value as DisplayCurrency)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["IDR", "USD"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="timezone">Timezone</Label><Input id="timezone" value={timezone} onChange={(event) => { setTimezone(event.target.value); setTimezoneError(""); }} aria-invalid={!!timezoneError} />{timezoneError && <p className="text-xs text-destructive">{timezoneError}</p>}</div></div><p className="mt-5 text-xs leading-relaxed text-muted-foreground">IDR is the default. Switch between IDR and USD any time in Settings; conversion uses the visible, timestamped FX snapshot.</p></div>}
              {step === 3 && <div><StepIcon icon={WalletCards} /><p className="mt-5 font-mono text-[10px] tracking-[0.18em] text-primary uppercase">Demo workspace</p><h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Your terminal is ready to explore.</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">We’ll start with realistic sample transactions, spending, BTC evidence, wallet events, and alerts. You can edit everything, reset the sample, or clear personal data from Settings.</p><div className="mt-7 grid gap-3 sm:grid-cols-3">{[{ value: "3", label: "Tracked assets" }, { value: "60D", label: "BTC history" }, { value: "4", label: "Wallet events" }].map((item) => <div key={item.label} className="rounded-lg border bg-background/50 p-4"><p className="numeric text-xl font-semibold">{item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.label}</p></div>)}</div><div className="mt-6 rounded-lg border border-success/20 bg-success/[0.04] p-4 text-sm text-muted-foreground"><strong className="text-foreground">Local by design.</strong> No market provider, database, AI model, or authentication service is connected.</div></div>}
              <div className="mt-8 flex items-center justify-between"><Button variant="ghost" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={step === 1 || submitting}><ArrowLeft />Back</Button>{step < 3 ? <Button onClick={() => setStep((value) => value + 1)} disabled={step === 1 && !accepted}>Continue<ArrowRight /></Button> : <Button onClick={() => void finish()} disabled={submitting}>{submitting ? "Saving…" : "Open terminal"}<ArrowRight /></Button>}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function StepIcon({ icon: Icon }: { icon: typeof ShieldCheck }) { return <div className="flex size-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Icon className="size-5" /></div>; }
