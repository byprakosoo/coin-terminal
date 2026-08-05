"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CheckCircle2, Database, Eye, LockKeyhole, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useTerminalStore } from "@/store/terminal-store";

const schema = z.object({
  name: z.string().optional(),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});

type Values = z.infer<typeof schema>;

export function AuthPage({ mode }: { mode: "sign-in" | "register" }) {
  const router = useRouter();
  const hydrated = useTerminalStore((state) => state.hydrated);
  const session = useTerminalStore((state) => state.session);
  const onboardingComplete = useTerminalStore((state) => state.profile.onboardingComplete);
  const refreshWorkspace = useTerminalStore((state) => state.refreshWorkspace);
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: mode === "register" ? "" : undefined, email: "", password: "" },
  });

  useEffect(() => {
    if (hydrated && session) router.replace(onboardingComplete ? "/overview" : "/onboarding");
  }, [hydrated, onboardingComplete, router, session]);

  const submit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    setServerError("");
    const result = mode === "sign-in"
      ? await authClient.signIn.email({ email: values.email, password: values.password })
      : await authClient.signUp.email({
          name: values.name?.trim() || values.email.split("@")[0],
          email: values.email,
          password: values.password,
        });
    if (result.error) {
      setServerError(result.error.message ?? "Authentication failed.");
      setSubmitting(false);
      return;
    }
    const loaded = await refreshWorkspace();
    setSubmitting(false);
    if (!loaded) {
      setServerError("Signed in, but the workspace could not be loaded.");
      return;
    }
    router.push(useTerminalStore.getState().profile.onboardingComplete ? "/overview" : "/onboarding");
  });

  return (
    <main className="terminal-grid relative flex min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_25%,rgb(246_167_35/0.08),transparent_28rem)]" />
      <section className="relative hidden w-[48%] flex-col justify-between border-r p-10 lg:flex xl:p-14">
        <Brand />
        <div className="max-w-lg">
          <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-primary uppercase">Evidence before opinion</p>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.045em] xl:text-5xl">Your money, market context, and research trail in one private terminal.</h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">Track real transactions, inspect transparent BTC signals, and keep provider credentials on the server.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[{ icon: Database, text: "Private database records" }, { icon: Eye, text: "Every signal has receipts" }, { icon: LockKeyhole, text: "No exchange credentials" }, { icon: ShieldCheck, text: "Research-only guardrails" }].map(({ icon: Icon, text }) => <div key={text} className="flex items-center gap-2.5 rounded-lg border bg-card/55 px-3.5 py-3 text-xs text-muted-foreground"><Icon className="size-4 text-primary" />{text}</div>)}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Authenticated workspace · Server-side data access</p>
      </section>
      <section className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Brand className="mb-10 lg:hidden" />
          <div className="mb-7">
            <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-primary uppercase">{mode === "sign-in" ? "Welcome back" : "Private workspace"}</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{mode === "sign-in" ? "Sign in to Coin Terminal" : "Create your private workspace"}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mode === "sign-in" ? "Enter the credentials for your workspace." : "Your password is securely handled by Better Auth."}</p>
          </div>
          <Card className="bg-card/82 shadow-2xl shadow-black/25">
            <CardContent className="p-5 sm:p-6">
              <form onSubmit={submit} className="space-y-4" noValidate>
                {mode === "register" && <Field label="Full name" error={form.formState.errors.name?.message}><Input suppressHydrationWarning autoComplete="name" {...form.register("name")} /></Field>}
                <Field label="Email" error={form.formState.errors.email?.message}><Input suppressHydrationWarning type="email" autoComplete="email" {...form.register("email")} aria-invalid={!!form.formState.errors.email} /></Field>
                <Field label="Password" error={form.formState.errors.password?.message}><Input suppressHydrationWarning type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} {...form.register("password")} aria-invalid={!!form.formState.errors.password} /></Field>
                {serverError && <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">{serverError}</div>}
                <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Please wait…" : mode === "sign-in" ? "Open terminal" : "Continue to setup"}<ArrowRight /></Button>
              </form>
            </CardContent>
          </Card>
          <p className="mt-5 text-center text-sm text-muted-foreground">{mode === "sign-in" ? "New to the terminal?" : "Already have a workspace?"} <Link href={mode === "sign-in" ? "/register" : "/sign-in"} className="font-medium text-primary hover:underline">{mode === "sign-in" ? "Create account" : "Sign in"}</Link></p>
          <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-muted-foreground"><CheckCircle2 className="size-3.5 text-success" />Research only — not investment advice</div>
        </div>
      </section>
    </main>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}{error && <p className="text-xs text-destructive">{error}</p>}</div>;
}
