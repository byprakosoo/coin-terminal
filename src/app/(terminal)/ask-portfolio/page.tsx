import type { Metadata } from "next";
import { AskPortfolioView } from "@/features/ask-portfolio/ask-portfolio-view";
export const metadata: Metadata = { title: "Ask Portfolio" };
export default function AskPortfolioPage() { return <AskPortfolioView />; }
