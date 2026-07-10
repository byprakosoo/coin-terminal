"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronRight, CircleHelp, Database, Ellipsis, MessageSquarePlus, PanelLeft, Send, ShieldCheck, Sparkles, Trash2, UserRound, Wrench } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EvidenceBadge, FreshnessBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const effectiveActiveId = activeId ?? conversations[0]?.id;
  const activeMessages = messages.filter((message) => message.conversationId === effectiveActiveId);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeMessages.length]);

  const handleNew = async () => { try { const id = await newConversation(); setActiveId(id); setMobileThreads(false); } catch (error) { toast.error("Conversation could not be created", { description: error instanceof Error ? error.message : undefined }); } };
  const submit = async (text = draft) => { const clean = text.trim(); if (!clean || sending) return; setSending(true); setDraft(""); try { const id = await sendMessage(effectiveActiveId, clean); setActiveId(id); } catch (error) { setDraft(clean); toast.error("Message could not be sent", { description: error instanceof Error ? error.message : undefined }); } finally { setSending(false); } };
  const remove = async () => { if (!deleteId) return; try { await deleteConversation(deleteId); if (effectiveActiveId === deleteId) setActiveId(conversations.find((item) => item.id !== deleteId)?.id); setDeleteId(undefined); toast.success("Conversation deleted", { description: "Messages and tool receipts are no longer available." }); } catch (error) { toast.error("Conversation could not be deleted", { description: error instanceof Error ? error.message : undefined }); } };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Grounded server assistant" title="Ask Portfolio" description="Question the same portfolio, spending, signal, and wallet records shown across the terminal." actions={<><Badge variant="success"><ShieldCheck />Allowlisted tools</Badge><Button size="sm" onClick={() => void handleNew()}><MessageSquarePlus />New conversation</Button></>} />
      <Card className="relative h-[calc(100vh-15.75rem)] min-h-[620px] overflow-hidden">
        <div className="grid h-full md:grid-cols-[260px_1fr] xl:grid-cols-[300px_1fr]">
          <aside className={cn("border-r bg-background/35", mobileThreads ? "absolute inset-x-4 z-20 mt-14 h-[calc(100%-8rem)] rounded-lg border shadow-2xl md:static md:mt-0 md:h-auto md:rounded-none md:border-y-0 md:border-l-0 md:shadow-none" : "hidden md:block")}>
            <div className="flex h-14 items-center justify-between border-b px-4"><p className="text-xs font-semibold">Conversations</p><Button variant="ghost" size="icon-sm" onClick={() => void handleNew()} aria-label="New conversation"><MessageSquarePlus /></Button></div>
            <div className="h-[calc(100%-3.5rem)] overflow-y-auto p-2">
              {conversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} active={effectiveActiveId === conversation.id} onSelect={() => { setActiveId(conversation.id); setMobileThreads(false); }} onDelete={() => setDeleteId(conversation.id)} />)}
              {!conversations.length && <div className="p-5 text-center"><CircleHelp className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">No conversations yet.</p></div>}
            </div>
          </aside>
          <section className="flex min-w-0 flex-col">
            <div className="flex h-14 items-center justify-between border-b px-4"><div className="flex items-center gap-2"><Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setMobileThreads((value) => !value)} aria-label="Show conversations"><PanelLeft /></Button><span className="flex size-7 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary"><Bot className="size-3.5" /></span><div><p className="text-xs font-medium">Portfolio Assistant</p><p className="font-mono text-[9px] text-success">SERVER TOOLS · READY</p></div></div><Badge variant="neutral"><Database />Authenticated data</Badge></div>
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {!activeMessages.length ? <EmptyChat onSuggestion={(value) => void submit(value)} /> : <div className="mx-auto max-w-3xl space-y-5">{activeMessages.map((message) => <MessageBubble key={message.id} message={message} />)}<div ref={bottomRef} /></div>}
            </div>
            <div className="border-t bg-background/65 p-3 sm:p-4"><div className="mx-auto max-w-3xl"><div className="rounded-lg border bg-card p-2 shadow-lg shadow-black/10 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10"><Textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="Ask about portfolio, spending, BTC signals, or wallet events…" className="min-h-[58px] resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0" /><div className="flex items-center justify-between gap-2 px-1"><p className="hidden text-[10px] text-muted-foreground sm:block">Enter to send · Shift + Enter for a new line</p><Button size="sm" className="ml-auto" onClick={() => void submit()} disabled={!draft.trim() || sending}>{sending ? "Working…" : "Send"}<Send /></Button></div></div><p className="mt-2 text-center text-[9px] text-muted-foreground">Answers use authenticated server-side tools and include persisted source receipts.</p></div></div>
          </section>
        </div>
      </Card>
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(undefined)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Delete conversation?</DialogTitle><DialogDescription>The conversation, messages, and tool receipts will no longer be available in your workspace.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setDeleteId(undefined)}>Cancel</Button><Button variant="destructive" onClick={() => void remove()}><Trash2 />Delete conversation</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function ConversationRow({ conversation, active, onSelect, onDelete }: { conversation: ReturnType<typeof useTerminalStore.getState>["conversations"][number]; active: boolean; onSelect: () => void; onDelete: () => void }) {
  return <div className={cn("group mb-1 flex items-start rounded-md p-1 transition", active ? "bg-primary/10" : "hover:bg-accent")}><button type="button" onClick={onSelect} className="min-w-0 flex-1 p-2 text-left"><p className={cn("truncate text-xs font-medium", active && "text-primary")}>{conversation.title}</p><p className="mt-1 font-mono text-[9px] text-muted-foreground">{relativeTime(conversation.updatedAt)}</p></button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="mt-1 opacity-60 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Actions for ${conversation.title}`}><Ellipsis /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem destructive onSelect={onDelete}><Trash2 />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
}

function EmptyChat({ onSuggestion }: { onSuggestion: (value: string) => void }) { return <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center py-10 text-center"><span className="flex size-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary"><Sparkles className="size-6" /></span><h2 className="mt-5 text-xl font-semibold tracking-[-0.03em]">Question your own data</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Each response cites the authenticated server tool or research snapshot it used, plus the calculation period and freshness.</p><div className="mt-7 grid w-full gap-2 sm:grid-cols-2">{suggestions.map((question) => <button key={question} onClick={() => onSuggestion(question)} className="group flex items-center justify-between gap-3 rounded-lg border bg-background/35 p-3.5 text-left text-xs leading-relaxed transition hover:border-primary/30 hover:bg-primary/[0.025]"><span>{question}</span><ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" /></button>)}</div></div>; }

function MessageBubble({ message }: { message: ReturnType<typeof useTerminalStore.getState>["messages"][number] }) {
  const assistant = message.role === "ASSISTANT";
  return <div className={cn("flex gap-3", !assistant && "justify-end")}>
    {assistant && <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary"><Bot className="size-4" /></span>}
    <div className={cn("max-w-[88%]", !assistant && "flex flex-row-reverse gap-3")}>
      <div className={cn("rounded-xl px-4 py-3 text-sm leading-6", assistant ? "border bg-background/45 text-foreground" : "bg-primary text-primary-foreground")}><p className="whitespace-pre-wrap">{message.content}</p>{assistant && message.investmentRelated && !message.content.includes("Research only — not investment advice") && <p className="mt-3 border-t border-warning/20 pt-2 text-xs font-medium text-warning">Research only — not investment advice.</p>}</div>
      {assistant && message.toolName && <div className="mt-2.5 space-y-2"><div className="flex flex-wrap items-center gap-2"><Badge variant="info"><Wrench />{message.toolName}</Badge><span className="font-mono text-[9px] text-muted-foreground">{relativeTime(message.createdAt)}</span></div>{message.sources?.map((source, index) => <div key={`${source.label}-${index}`} className="flex flex-wrap items-center gap-2 rounded-md border bg-background/35 px-3 py-2 text-[10px]"><EvidenceBadge value={source.kind} /><span className="font-medium">{source.label}</span><span className="text-muted-foreground">{source.period}</span><span className="ml-auto"><FreshnessBadge value={source.freshness} /></span></div>)}</div>}
    </div>
    {!assistant && <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-secondary text-muted-foreground"><UserRound className="size-4" /></span>}
  </div>;
}
