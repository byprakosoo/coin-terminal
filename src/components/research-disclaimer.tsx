import { ShieldAlert } from "lucide-react";

export function ResearchDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-warning/20 bg-warning/[0.045] px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <span><strong className="font-medium text-foreground">Research only — not investment advice.</strong>{!compact && " Public-wallet labels and market signals are transparent approximations, not guarantees of identity, accuracy, or returns."}</span>
    </div>
  );
}
