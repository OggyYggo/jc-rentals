import { AuthForm } from "@/components/customer/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/shared";
export const metadata = { title: "Log in", robots: { index: false, follow: false } };

export const instant = false;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string }> }) {
  const { next, error } = await searchParams;
  const initialMessage = error === "auth_cancelled" ? "Google sign-in was cancelled. You can try again or sign in with email."
    : error === "auth" ? "Sign-in could not be completed. Please try again." : "";
  return <main className="theme-public flex min-h-[calc(100vh-68px)] items-center justify-center bg-[#F5FAFF] px-5 py-12"><AuthForm mode="login" configured={isSupabaseConfigured()} next={typeof next === "string" ? next : undefined} initialMessage={initialMessage} /></main>;
}
