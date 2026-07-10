import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getServerSessionProfile } from "@/server/session";

export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  const authenticated = await getServerSessionProfile();
  if (!authenticated) redirect("/sign-in");
  if (!authenticated.profile.onboardingComplete) redirect("/onboarding");
  return <AppShell>{children}</AppShell>;
}
