"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Bot, Check, ChevronRight, CircleHelp, Database, Ellipsis, Globe2, KeyRound, MessageSquarePlus, PanelLeft, Plus, RefreshCw, Send, Settings2, ShieldCheck, Sparkles, Trash2, UserRound, Wrench } from "lucide-react";
import { toast } from "sonner";
import { AI_MODEL_PRESETS, aiModelProviderLabel } from "@/lib/ai-models";
import type { AiModelConfigInput, AiModelConfigSummary, AiModelProvider } from "@/lib/ai-models";
import type { AiUsageSummary } from "@/lib/ai-usage";
import { apiRequest, jsonBody } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { EvidenceBadge, FreshnessBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, relativeTime } from "@/lib/utils";
import { useTerminalStore } from "@/store/terminal-store";

const suggestions = [
  "What is my total portfolio value today?",
  "Why is BTC currently WATCH?",
  "How did my expenses change compared with last month?",
  "Is the latest smart-money event too late to enter?",
  "What data should I fix before trusting my P&L?",
];

export function AskPortfolioView() {
  const conversations = useTerminalStore((state) => state.conversations);
  const messages = useTerminalStore((state) => state.messages);
  const sendMessage = useTerminalStore((state) => state.sendMessage);
  const newConversation = useTerminalStore((state) => state.newConversation);
  const deleteConversation = useTerminalStore((state) => state.deleteConversation);
  const [activeId, setActiveId] = useState<string | undefined>(conversations[0]?.id);
  const [draft, setDraft] = useState("");
  const [deleteId, setDeleteId] = useState<string | undefined>();
  const [mobileThreads, setMobileThreads] = useState(false);
  const [sending, setSending] = useState(false);
  const [processingStage, setProcessingStage] = useState("Planning retrieval…");
  const [modelConfigs, setModelConfigs] = useState<AiModelConfigSummary[]>([]);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelTestingId, setModelTestingId] = useState<string>();
  const [modelError, setModelError] = useState("");
  const [modelForm, setModelForm] = useState<AiModelConfigInput>(newModelForm());
  const [codexLogin, setCodexLogin] = useState<CodexLoginState>();
  const [usage, setUsage] = useState<AiUsageSummary>();
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const effectiveActiveId = activeId ?? conversations[0]?.id;
  const activeMessages = messages.filter((message) => message.conversationId === effectiveActiveId);
  const activeConfig = modelConfigs.find((config) => config.active);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeMessages.length]);
  const loadModelConfigs = useCallback(async () => {
    const result = await apiRequest<AiModelConfigSummary[]>("/api/ai-models");
    setModelConfigs(result);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadModelConfigs().catch(() => undefined); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadModelConfigs]);
  useEffect(() => {
    if (!codexLogin || codexLogin.status !== "PENDING") return;
    const timer = window.setInterval(() => {
      void apiRequest<CodexLoginState>(`/api/ai-models/openai-codex/device/${codexLogin.loginId}`)
        .then(async (status) => {
          setCodexLogin((current) => current?.loginId === codexLogin.loginId ? { ...current, ...status } : current);
          if (status.status === "COMPLETED") {
            await loadModelConfigs();
            toast.success("ChatGPT connected", { description: "Ask Portfolio will use your ChatGPT / Codex connection." });
          }
        })
        .catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [codexLogin, loadModelConfigs]);
  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError("");
    try {
      setUsage(await apiRequest<AiUsageSummary>("/api/ai-models/usage"));
    } catch (error) {
      setUsage(undefined);
      setUsageError(error instanceof Error ? error.message : "AI usage could not be loaded.");
    } finally {
      setUsageLoading(false);
    }
  }, []);
  useEffect(() => {
    if (activeConfig?.provider !== "OPENAI_CODEX") return;
    const timer = window.setTimeout(() => { void loadUsage(); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeConfig?.id, activeConfig?.provider, loadUsage]);

  const handleNew = async () => { try { const id = await newConversation(); setActiveId(id); setMobileThreads(false); } catch (error) { toast.error("Conversation could not be created", { description: error instanceof Error ? error.message : undefined }); } };
  const submit = async (text = draft) => { const clean = text.trim(); if (!clean || sending) return; setSending(true); setProcessingStage("Planning retrieval…"); setDraft(""); const stages = ["Planning retrieval…", "Reading portfolio…", "Checking live sources…", "Writing grounded answer…"]; let stageIndex = 0; const stageTimer = window.setInterval(() => { stageIndex = Math.min(stageIndex + 1, stages.length - 1); setProcessingStage(stages[stageIndex]); }, 900); try { const id = await sendMessage(effectiveActiveId, clean); setActiveId(id); } catch (error) { setDraft(clean); toast.error("Message could not be sent", { description: error instanceof Error ? error.message : undefined }); } finally { window.clearInterval(stageTimer); setSending(false); if (activeConfig?.provider === "OPENAI_CODEX") void loadUsage(); } };
  const remove = async () => { if (!deleteId) return; try { await deleteConversation(deleteId); if (effectiveActiveId === deleteId) setActiveId(conversations.find((item) => item.id !== deleteId)?.id); setDeleteId(undefined); toast.success("Conversation deleted", { description: "Messages and tool receipts are no longer available." }); } catch (error) { toast.error("Conversation could not be deleted", { description: error instanceof Error ? error.message : undefined }); } };
  const openNewModel = () => { setModelForm(newModelForm()); setModelError(""); setModelDialogOpen(true); };
  const editModel = (config: AiModelConfigSummary) => { setModelForm({ id: config.id, label: config.label, provider: config.provider, model: config.model, endpointUrl: config.endpointUrl }); setModelError(""); setModelDialogOpen(true); };
  const saveModel = async () => {
    setModelSaving(true);
    setModelError("");
    try {
      await apiRequest<AiModelConfigSummary>("/api/ai-models", { method: "POST", body: jsonBody(modelForm) });
      await loadModelConfigs();
      setModelDialogOpen(false);
      toast.success("AI model saved", { description: "Future Ask Portfolio questions will use this model." });
    } catch (error) {
      setModelError(error instanceof Error ? error.message : "The AI model could not be saved.");
    } finally { setModelSaving(false); }
  };
  const testModel = async (id: string, label: string) => {
    setModelTestingId(id);
    try {
      await apiRequest<{ provider: string; model: string; response?: string }>(`/api/ai-models/${id}`, { method: "POST" });
      toast.success("AI model is working", { description: `${label} answered the connection test.` });
    } catch (error) {
      toast.error("AI model test failed", { description: error instanceof Error ? error.message : "The provider did not return a usable response." });
    } finally { setModelTestingId(undefined); }
  };
  const activateModel = async (id: string, active: boolean) => {
    try { await apiRequest<AiModelConfigSummary[]>(`/api/ai-models/${id}`, { method: "PATCH", body: jsonBody({ active }) }); await loadModelConfigs(); } catch (error) { toast.error("AI model could not be changed", { description: error instanceof Error ? error.message : undefined }); }
  };
  const deleteModel = async (id: string, label: string) => {
    if (!window.confirm(`Remove the saved ${label} model and its encrypted API key?`)) return;
    try { await apiRequest<void>(`/api/ai-models/${id}`, { method: "DELETE" }); await loadModelConfigs(); toast.success("AI model removed"); } catch (error) { toast.error("AI model could not be removed", { description: error instanceof Error ? error.message : undefined }); }
  };
  const connectCodex = async () => {
    setModelError("");
    try {
      const login = await apiRequest<Omit<CodexLoginState, "status">>("/api/ai-models/openai-codex/device", { method: "POST" });
      setCodexLogin({ ...login, status: "PENDING" });
    } catch (error) {
      setModelError(error instanceof Error ? error.message : "ChatGPT could not be connected.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Grounded AI assistant" title="Ask Portfolio" description="Ask open-ended questions about the same portfolio, spending, signal, and wallet records shown across the terminal; model synthesis fails safely to deterministic selectors." actions={<div className="flex flex-wrap items-center justify-end gap-2"><Badge variant="success"><ShieldCheck />Grounded context</Badge><Select value={activeConfig?.id ?? "server-fallback"} onValueChange={(value) => { if (value !== "server-fallback") void activateModel(value, true); else if (activeConfig) void activateModel(activeConfig.id, false); }}><SelectTrigger className="h-9 w-[12rem] text-xs" aria-label="Active AI model"><SelectValue placeholder="Server fallback" /></SelectTrigger><SelectContent><SelectItem value="server-fallback">Server fallback</SelectItem>{modelConfigs.map((config) => <SelectItem key={config.id} value={config.id}>{config.label} · {config.model}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="sm" onClick={() => { setUsageDialogOpen(true); void loadUsage(); }}><Activity />AI usage</Button><Button variant="outline" size="sm" onClick={openNewModel}><Settings2 />AI models</Button><Button size="sm" onClick={() => void handleNew()}><MessageSquarePlus />New conversation</Button></div>} />
      <Card className="relative h-[calc(100vh-15.75rem)] min-h-[620px] overflow-hidden">
        <div className="grid h-full min-h-0 md:grid-cols-[260px_1fr] xl:grid-cols-[300px_1fr]">
          <aside className={cn("flex min-h-0 flex-col border-r bg-background/35", mobileThreads ? "absolute inset-x-4 z-20 mt-14 h-[calc(100%-8rem)] rounded-lg border shadow-2xl md:static md:mt-0 md:h-auto md:rounded-none md:border-y-0 md:border-l-0 md:shadow-none" : "hidden md:flex")}>
            <div className="flex h-14 items-center justify-between border-b px-4"><p className="text-xs font-semibold">Conversations</p><Button variant="ghost" size="icon-sm" onClick={() => void handleNew()} aria-label="New conversation"><MessageSquarePlus /></Button></div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {conversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} active={effectiveActiveId === conversation.id} onSelect={() => { setActiveId(conversation.id); setMobileThreads(false); }} onDelete={() => setDeleteId(conversation.id)} />)}
              {!conversations.length && <div className="p-5 text-center"><CircleHelp className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">No conversations yet.</p></div>}
            </div>
          </aside>
          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="flex h-14 items-center justify-between border-b px-4"><div className="flex items-center gap-2"><Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setMobileThreads((value) => !value)} aria-label="Show conversations"><PanelLeft /></Button><span className="flex size-7 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary"><Bot className="size-3.5" /></span><div><p className="text-xs font-medium">Portfolio Assistant</p><p className="font-mono text-[9px] text-success">GROUNDED AI · TWO-STAGE RETRIEVAL</p></div></div><Badge variant="neutral"><Database />Authenticated data</Badge></div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {!activeMessages.length ? <EmptyChat onSuggestion={(value) => void submit(value)} /> : <div className="mx-auto max-w-3xl space-y-5">{activeMessages.map((message) => <MessageBubble key={message.id} message={message} />)}<div ref={bottomRef} /></div>}
            </div>
            <div className="border-t bg-background/65 p-3 sm:p-4"><div className="mx-auto max-w-3xl">{sending && <div className="mb-2 flex items-center justify-center gap-2 text-[10px] text-primary"><Sparkles className="size-3.5 animate-pulse" />{processingStage}</div>}<div className="rounded-lg border bg-card p-2 shadow-lg shadow-black/10 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10"><Textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="Ask anything about your portfolio, spending, signals, or next actions…" className="min-h-[58px] resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0" /><div className="flex items-center justify-between gap-2 px-1"><p className="hidden text-[10px] text-muted-foreground sm:block">Ask any question · Enter to send · Shift + Enter for a new line</p><Button size="sm" className="ml-auto" onClick={() => void submit()} disabled={!draft.trim() || sending}>{sending ? "Working…" : "Send"}<Send /></Button></div></div><p className="mt-2 text-center text-[9px] text-muted-foreground">Suggestions are examples, not a limit. GPT-5.6 Luna can answer free-form questions using your authenticated portfolio context.</p></div></div>
          </section>
        </div>
      </Card>
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(undefined)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Delete conversation?</DialogTitle><DialogDescription>The conversation, messages, and tool receipts will no longer be available in your workspace.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setDeleteId(undefined)}>Cancel</Button><Button variant="destructive" onClick={() => void remove()}><Trash2 />Delete conversation</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={modelDialogOpen} onOpenChange={setModelDialogOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>AI model connections</DialogTitle><DialogDescription>Save provider keys server-side, then choose which model answers new questions. After saving, use Test to verify the provider before asking Portfolio Assistant. Keys are encrypted and never shown again. OpenAI ChatGPT/Gmail login is separate from Platform API access.</DialogDescription></DialogHeader><div className="space-y-5"><div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">Connect ChatGPT / Codex</p><p className="mt-1 text-xs text-muted-foreground">Login at OpenAI without pasting a ChatGPT password, session token, or API key.</p></div><Button variant="outline" size="sm" onClick={() => void connectCodex()} disabled={codexLogin?.status === "PENDING"}><Sparkles />{codexLogin?.status === "PENDING" ? "Waiting for login…" : "Connect with ChatGPT"}</Button></div>{codexLogin && <div className="mt-4 rounded-md border bg-background/50 p-3 text-xs"><p className="font-medium">{codexLogin.status === "PENDING" ? "Finish login in the OpenAI page" : codexLogin.status === "COMPLETED" ? "ChatGPT connected" : codexLogin.status === "EXPIRED" ? "Login code expired" : "ChatGPT login failed"}</p>{codexLogin.status === "PENDING" && <><p className="mt-1 text-muted-foreground">Open the page, enter this one-time code, then keep this dialog open:</p><div className="mt-3 flex flex-wrap items-center gap-3"><a className="font-medium text-primary underline underline-offset-4" href={codexLogin.verificationUrl} target="_blank" rel="noreferrer">Open OpenAI login</a><code className="rounded bg-secondary px-2 py-1 font-mono text-sm tracking-widest">{codexLogin.userCode}</code></div></>}</div>}</div><div className="space-y-2">{modelConfigs.map((config) => <div key={config.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border p-3", config.active && "border-primary/35 bg-primary/[0.04]")}><div className="flex min-w-0 flex-1 items-center gap-2"><span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border", config.active ? "border-success/30 bg-success/10 text-success" : "bg-secondary text-muted-foreground")}>{config.active ? <Check className="size-4" /> : <Bot className="size-4" />}</span><div className="min-w-0"><p className="truncate text-xs font-medium">{config.label} · {config.model}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{aiModelProviderLabel(config.provider)} · {config.provider === "OPENAI_CODEX" ? "OAuth connection" : `key ending in ${config.apiKeyHint}`}</p></div></div><div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => void testModel(config.id, config.label)} disabled={modelTestingId === config.id}>{modelTestingId === config.id ? "Testing…" : "Test"}</Button>{config.provider !== "OPENAI_CODEX" && <Button variant="ghost" size="sm" onClick={() => editModel(config)}>Edit</Button>}{!config.active && <Button variant="outline" size="sm" onClick={() => void activateModel(config.id, true)}>Use</Button>}<Button variant="ghost" size="icon-sm" onClick={() => void deleteModel(config.id, config.label)} aria-label={`Remove ${config.label}`}><Trash2 /></Button></div></div>)}{!modelConfigs.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">No saved model yet. Add one below; until then the server fallback remains active.</div>}</div><div className="border-t pt-5"><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-medium">{modelForm.id ? "Edit model" : "Add model"}</p><p className="mt-1 text-xs text-muted-foreground">Your key is sent only to the authenticated backend.</p></div><Button variant="ghost" size="sm" onClick={openNewModel}><Plus />New</Button></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Provider</Label><Select value={modelForm.provider} onValueChange={(value) => { const provider = value as AiModelProvider; setModelForm((current) => ({ ...current, provider, endpointUrl: AI_MODEL_PRESETS[provider].endpointUrl, model: current.model || AI_MODEL_PRESETS[provider].modelPlaceholder })); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(AI_MODEL_PRESETS) as AiModelProvider[]).filter((provider) => provider !== "OPENAI_CODEX").map((provider) => <SelectItem key={provider} value={provider}>{AI_MODEL_PRESETS[provider].label}</SelectItem>)}</SelectContent></Select><p className="text-[10px] text-muted-foreground">{AI_MODEL_PRESETS[modelForm.provider].help}</p></div><div className="space-y-2"><Label htmlFor="ai-model-label">Name</Label><Input id="ai-model-label" value={modelForm.label} onChange={(event) => setModelForm((current) => ({ ...current, label: event.target.value }))} placeholder="My Claude" /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="ai-model-name">Model ID</Label><Input id="ai-model-name" value={modelForm.model} onChange={(event) => setModelForm((current) => ({ ...current, model: event.target.value }))} placeholder={AI_MODEL_PRESETS[modelForm.provider].modelPlaceholder} /></div>{modelForm.provider === "OPENAI_COMPATIBLE" && <div className="space-y-2 sm:col-span-2"><Label htmlFor="ai-model-endpoint">HTTPS endpoint</Label><Input id="ai-model-endpoint" value={modelForm.endpointUrl ?? ""} onChange={(event) => setModelForm((current) => ({ ...current, endpointUrl: event.target.value }))} placeholder="https://your-provider.example/v1/chat/completions" /><p className="text-[10px] text-muted-foreground">Must be a public HTTPS Chat Completions endpoint. Local/private URLs are blocked.</p></div>}<div className="space-y-2 sm:col-span-2"><Label htmlFor="ai-model-key">API key</Label><div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="ai-model-key" type="password" className="pl-9" value={modelForm.apiKey ?? ""} onChange={(event) => setModelForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder={modelForm.id ? "Leave blank to keep the saved key" : "Paste your provider API key"} autoComplete="new-password" /></div></div></div>{modelError && <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">{modelError}</p>}</div></div><DialogFooter><Button variant="ghost" onClick={() => setModelDialogOpen(false)}>Cancel</Button><Button onClick={() => void saveModel()} disabled={modelSaving || !modelForm.label.trim() || !modelForm.model.trim() || (!modelForm.id && !modelForm.apiKey?.trim())}>{modelSaving ? "Saving…" : "Save & use model"}<Check /></Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>AI usage remaining</DialogTitle><DialogDescription>Read-only usage from the account connected to the active AI model. Credentials never leave the server.</DialogDescription></DialogHeader><AiUsagePanel usage={usage} loading={usageLoading} error={usageError} onRefresh={() => void loadUsage()} /><DialogFooter><Button variant="ghost" onClick={() => setUsageDialogOpen(false)}>Close</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function newModelForm(provider: AiModelProvider = "OPENAI"): AiModelConfigInput {
  return { label: "My OpenAI", provider, model: "", endpointUrl: AI_MODEL_PRESETS[provider].endpointUrl, apiKey: "" };
}

type CodexLoginState = {
  loginId: string;
  verificationUrl: string;
  userCode: string;
  expiresAt: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";
};

function AiUsagePanel({ usage, loading, error, onRefresh }: { usage?: AiUsageSummary; loading: boolean; error: string; onRefresh: () => void }) {
  const windows = [usage?.primaryWindow, usage?.secondaryWindow].filter((window): window is NonNullable<typeof window> => Boolean(window));
  return <div className="rounded-lg border bg-background/35 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Activity className="size-4 text-primary" /><p className="text-sm font-medium">Usage from active model</p></div><p className="mt-1 text-xs text-muted-foreground">ChatGPT/Codex limits are shared across eligible ChatGPT work surfaces.</p></div><Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}><RefreshCw className={cn(loading && "animate-spin")} />{loading ? "Refreshing…" : "Refresh"}</Button></div>{error && <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}{loading && !usage && <p className="mt-4 text-xs text-muted-foreground">Reading usage from your connected account…</p>}{usage?.availability === "AVAILABLE" && <div className="mt-4 space-y-3">{usage.planType && <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Plan · {usage.planType}</p>}{windows.map((window) => <div key={window.label} className="rounded-md border bg-card p-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium">{window.label}</span><span className="font-semibold text-success">{Math.round(window.remainingPercent)}% left</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-success transition-all" style={{ width: `${window.remainingPercent}%` }} /></div>{window.resetAt && <p className="mt-2 text-[10px] text-muted-foreground">Resets {formatUsageDate(window.resetAt)}</p>}</div>)}{usage.credits && <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs"><span className="text-muted-foreground">Credits</span><span className="font-medium">{usage.credits.unlimited ? "Unlimited" : usage.credits.balance === undefined ? "Unavailable" : `${formatUsageBalance(usage.credits.balance)} credits left`}</span></div>}<p className="text-[10px] text-muted-foreground">Updated {formatUsageDate(usage.observedAt)}</p></div>}{usage?.availability === "NOT_SUPPORTED" && <p className="mt-4 rounded-md border border-warning/25 bg-warning/5 p-3 text-xs text-warning">{usage.message}</p>}{usage?.availability === "UNAVAILABLE" && <p className="mt-4 rounded-md border border-warning/25 bg-warning/5 p-3 text-xs text-warning">{usage.message}</p>}</div>;
}

function formatUsageDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatUsageBalance(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat("en-US").format(numeric) : value;
}

function ConversationRow({ conversation, active, onSelect, onDelete }: { conversation: ReturnType<typeof useTerminalStore.getState>["conversations"][number]; active: boolean; onSelect: () => void; onDelete: () => void }) {
  return <div className={cn("group mb-1 flex items-start rounded-md p-1 transition", active ? "bg-primary/10" : "hover:bg-accent")}><button type="button" onClick={onSelect} className="min-w-0 flex-1 p-2 text-left"><p className={cn("truncate text-xs font-medium", active && "text-primary")}>{conversation.title}</p><p className="mt-1 font-mono text-[9px] text-muted-foreground">{relativeTime(conversation.updatedAt)}</p></button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="mt-1 opacity-60 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Actions for ${conversation.title}`}><Ellipsis /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem destructive onSelect={onDelete}><Trash2 />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
}

function EmptyChat({ onSuggestion }: { onSuggestion: (value: string) => void }) { return <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center py-10 text-center"><span className="flex size-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary"><Sparkles className="size-6" /></span><h2 className="mt-5 text-xl font-semibold tracking-[-0.03em]">Question your own data</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Open-ended model synthesis can combine the allowlisted context. Every response keeps the authenticated selector, calculation period, freshness, and deterministic fallback.</p><div className="mt-7 grid w-full gap-2 sm:grid-cols-2">{suggestions.map((question) => <button key={question} onClick={() => onSuggestion(question)} className="group flex items-center justify-between gap-3 rounded-lg border bg-background/35 p-3.5 text-left text-xs leading-relaxed transition hover:border-primary/30 hover:bg-primary/[0.025]"><span>{question}</span><ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" /></button>)}</div></div>; }

function MessageBubble({ message }: { message: ReturnType<typeof useTerminalStore.getState>["messages"][number] }) {
  const assistant = message.role === "ASSISTANT";
  const modelGenerated = message.generationMode === "VERCEL_AI_GATEWAY" || message.generationMode === "OPENAI" || message.generationMode === "CUSTOM_AI";
  const generationLabel = message.generationMode === "VERCEL_AI_GATEWAY"
    ? `AI Gateway · ${message.model ?? "model"}`
    : message.generationMode === "OPENAI"
      ? message.model ?? "OpenAI model"
      : message.generationMode === "CUSTOM_AI"
        ? `${message.provider ?? "Custom AI"} · ${message.model ?? "model"}`
      : fallbackGenerationLabel(message.generationFallbackReason);
  return <div className={cn("flex gap-3", !assistant && "justify-end")}>
    {assistant && <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary"><Bot className="size-4" /></span>}
    <div className={cn("max-w-[88%]", !assistant && "flex flex-row-reverse gap-3")}>
      <div className={cn("rounded-xl px-4 py-3 text-sm leading-6", assistant ? "border bg-background/45 text-foreground" : "bg-primary text-primary-foreground")}><p className="whitespace-pre-wrap">{message.content}</p>{assistant && message.investmentRelated && !message.content.includes("Research only — not investment advice") && <p className="mt-3 border-t border-warning/20 pt-2 text-xs font-medium text-warning">Research only — not investment advice.</p>}</div>
      {assistant && message.toolName && <div className="mt-2.5 space-y-2"><div className="flex flex-wrap items-center gap-2">{(message.toolsUsed?.length ? message.toolsUsed : [message.toolName]).map((tool) => <Badge key={tool} variant="info"><Wrench />{tool}</Badge>)}{message.webMode && message.webMode !== "NONE" && <Badge variant={message.webMode === "UNAVAILABLE" ? "warning" : "success"}><Globe2 />Web {message.webMode.toLowerCase()}</Badge>}{message.generationMode && <Badge variant={modelGenerated ? "success" : "neutral"}>{modelGenerated ? <Sparkles /> : <ShieldCheck />}{generationLabel}</Badge>}{message.validationOutcome === "REWRITTEN" && <Badge variant="warning"><ShieldCheck />Safety rewrite</Badge>}<span className="font-mono text-[9px] text-muted-foreground">{relativeTime(message.createdAt)}{message.latencyMs ? ` · ${(message.latencyMs / 1000).toFixed(1)}s` : ""}</span></div>{message.sources?.map((source, index) => <div key={`${source.label}-${index}`} className="flex flex-wrap items-center gap-2 rounded-md border bg-background/35 px-3 py-2 text-[10px]">{source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="contents"><EvidenceBadge value={source.kind} /><span className="font-medium underline underline-offset-2">{source.label}</span></a> : <><EvidenceBadge value={source.kind} /><span className="font-medium">{source.label}</span></>}<span className="text-muted-foreground">{source.period}</span><span className="ml-auto"><FreshnessBadge value={source.freshness} /></span></div>)}</div>}
    </div>
    {!assistant && <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-secondary text-muted-foreground"><UserRound className="size-4" /></span>}
  </div>;
}

function fallbackGenerationLabel(reason: ReturnType<typeof useTerminalStore.getState>["messages"][number]["generationFallbackReason"]) {
  switch (reason) {
    case "NOT_CONFIGURED": return "Fallback · AI not configured";
    case "PROVIDER_AUTHENTICATION": return "Fallback · AI authentication";
    case "PROVIDER_BILLING": return "Fallback · AI billing setup";
    case "PROVIDER_RATE_LIMIT": return "Fallback · AI rate limit";
    case "EMPTY_RESPONSE": return "Fallback · empty model response";
    case "UNSAFE_RESPONSE": return "Fallback · model safety guard";
    case "PLANNER_ERROR": return "Fallback · retrieval planner";
    case "SAFETY_REWRITE_FAILED": return "Fallback · safety rewrite";
    case "WEB_UNAVAILABLE": return "Fallback · live web unavailable";
    default: return "Fallback · AI unavailable";
  }
}
