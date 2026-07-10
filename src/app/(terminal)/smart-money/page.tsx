import type { Metadata } from "next";
import { Suspense } from "react";
import { SmartMoneyView } from "@/features/smart-money/smart-money-view";
export const metadata: Metadata = { title: "Smart Money Watch" };
export default function SmartMoneyPage() { return <Suspense fallback={<div className="h-96 animate-pulse rounded-lg border bg-card" />}><SmartMoneyView /></Suspense>; }
