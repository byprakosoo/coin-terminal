import { AlertTriangle, Calculator, CircleCheck, Eye, Radio, ShieldQuestion, TimerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EntryStatus, EvidenceKind, Freshness, SignalAction, WalletClassification } from "@/lib/types";

export function SignalBadge({ value }: { value: SignalAction }) {
  const variant = value === "BUY" ? "success" : value === "SELL" ? "risk" : "warning";
  return <Badge variant={variant}>{value}</Badge>;
}

export function EntryBadge({ value }: { value: EntryStatus }) {
  const variant = value === "EARLY" ? "success" : value === "CONFIRMED" ? "info" : "risk";
  return <Badge variant={variant}>{value === "EXTENDED" || value === "AVOID" ? <AlertTriangle /> : <CircleCheck />}{value}</Badge>;
}

export function FreshnessBadge({ value }: { value: Freshness }) {
  const variant = value === "FRESH" ? "success" : value === "DELAYED" ? "warning" : value === "STALE" || value === "MISSING" ? "risk" : "neutral";
  return <Badge variant={variant}>{value === "FRESH" ? <Radio /> : <TimerOff />}{value}</Badge>;
}

export function EvidenceBadge({ value }: { value: EvidenceKind }) {
  const icons = {
    OBSERVED: Eye,
    CALCULATED: Calculator,
    INFERRED: ShieldQuestion,
    UNVERIFIED: AlertTriangle,
    STALE: TimerOff,
  };
  const Icon = icons[value];
  const variant = value === "OBSERVED" ? "success" : value === "CALCULATED" ? "info" : value === "INFERRED" ? "warning" : "risk";
  return <Badge variant={variant}><Icon />{value}</Badge>;
}

export function WalletBadge({ value }: { value: WalletClassification }) {
  const labels: Record<WalletClassification, string> = {
    USER_VERIFIED: "User verified",
    PUBLICLY_ATTRIBUTED: "Publicly attributed",
    HIGH_PERFORMANCE_PROXY: "Performance proxy",
    UNVERIFIED_WHALE: "Unverified whale",
    EXCLUDED: "Excluded",
  };
  const variant = value === "HIGH_PERFORMANCE_PROXY" || value === "USER_VERIFIED" ? "success" : value === "PUBLICLY_ATTRIBUTED" ? "info" : value === "UNVERIFIED_WHALE" ? "warning" : "risk";
  return <Badge variant={variant}>{labels[value]}</Badge>;
}
