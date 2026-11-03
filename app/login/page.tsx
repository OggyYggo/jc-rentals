import { AuthForm } from "@/components/customer/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export default function LoginPage() {
  return <main className="flex min-h-[calc(100vh-68px)] items-center justify-center bg-[#f5f7fb] px-5 py-12"><AuthForm mode="login" configured={isSupabaseConfigured()} /></main>;
}
