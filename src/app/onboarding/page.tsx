import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingPage } from "@/components/onboarding-page";
import { getServerSessionProfile } from "@/server/session";
export const metadata: Metadata = { title: "Setup" };
export default async function Onboarding() {
  const authenticated = await getServerSessionProfile();
  if (!authenticated) redirect("/sign-in");
  if (authenticated.profile.onboardingComplete) redirect("/overview");
  return <OnboardingPage />;
}
