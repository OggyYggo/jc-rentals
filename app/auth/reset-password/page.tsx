import Link from "next/link";
import { PasswordUpdateForm } from "@/components/auth/password-update-form";

export default function ResetPasswordPage() {
  return <main className="flex min-h-[70vh] items-center justify-center bg-[#F5FAFF] px-5 py-12"><div className="w-full max-w-md">
    <Link href="/" className="text-sm font-semibold text-[#2457d6]">Kuyog Bohol</Link>
    <h1 className="mt-5 text-2xl font-semibold text-[#203149]">Choose a new password</h1>
    <p className="mb-5 mt-2 text-sm leading-6 text-[#718096]">Enter and confirm a new password for your Kuyog Bohol account.</p>
    <PasswordUpdateForm mode="reset"/>
  </div></main>;
}
