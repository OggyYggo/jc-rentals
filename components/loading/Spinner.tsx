import { LoaderCircle } from "lucide-react";
import { cn } from "cn";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <span role="status" aria-live="polite" className="inline-flex items-center"><LoaderCircle aria-hidden="true" className={cn("size-5 animate-spin motion-reduce:animate-none", className)} /><span className="sr-only">{label}</span></span>;
}
