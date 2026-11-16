"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "./Spinner";

export function SubmitButton({ children, pendingText, className }: { children: React.ReactNode; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} aria-busy={pending} className={className}>{pending && <Spinner className="mr-2 size-4 text-current" />}{pending ? pendingText ?? children : children}</Button>;
}
