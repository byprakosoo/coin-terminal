import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { getServerSessionProfile } from "@/server/session";
export const metadata: Metadata = { title: "Register" };
export default async function RegisterPage() {
  const authenticated = await getServerSessionProfile();
  if (authenticated) redirect(authenticated.profile.onboardingComplete ? "/overview" : "/onboarding");
  return <AuthPage mode="register" />;
}
