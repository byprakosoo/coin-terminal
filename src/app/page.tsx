import { redirect } from "next/navigation";
import { getServerSessionProfile } from "@/server/session";

export default async function HomePage() {
  const authenticated = await getServerSessionProfile();
  redirect(!authenticated ? "/sign-in" : authenticated.profile.onboardingComplete ? "/overview" : "/onboarding");
}
