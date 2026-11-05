import { AuthForm } from "@/components/customer/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/shared";
export const instant = false;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <main className="theme-public flex min-h-[calc(100vh-68px)] items-center justify-center bg-[#F5FAFF] px-5 py-12"><AuthForm mode="login" configured={isSupabaseConfigured()} next={next} /></main>;
}
