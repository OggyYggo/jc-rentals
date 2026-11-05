import { AuthForm } from "@/components/customer/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export default function SignupPage() {
  return <main className="theme-public flex min-h-[calc(100vh-68px)] items-center justify-center bg-[#F5FAFF] px-5 py-12"><AuthForm mode="signup" configured={isSupabaseConfigured()} /></main>;
}
