import type { Metadata } from "next";
import { BtcResearchView } from "@/features/btc-research/btc-research-view";
export const metadata: Metadata = { title: "BTC Research" };
export default function BtcResearchPage() { return <BtcResearchView />; }
