import Link from "next/link";
import { Logo } from "@/components/logo";

export function PublicFooter() {
  return <footer className="public-footer theme-public relative overflow-hidden bg-[#0A3D91] px-5 pb-9 pt-12 text-white sm:px-8"><div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5"><Link href="/" className="flex items-center gap-2 font-semibold"><Logo size={36} />Kuyog Bohol</Link><div className="flex flex-wrap gap-x-5 gap-y-3 text-xs text-white/85"><Link href="/cars">Cars</Link><Link href="/#how-it-works">How it works</Link><Link href="/for-owners">List your car</Link><Link href="/contact">Contact</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div><p className="w-full border-t border-white/20 pt-5 text-xs text-white/80">Car rental in Bohol. Self-drive or with a local driver.</p></div></footer>;
}
