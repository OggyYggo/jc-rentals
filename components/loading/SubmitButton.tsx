"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "./Spinner";

type Props = ComponentProps<"button"> & { pendingText?: string; busy?: boolean; unstyled?: boolean };

export function SubmitButton({ children, pendingText, className, disabled, busy, unstyled, type = "submit", ...props }: Props) {
  const status = useFormStatus();
  const pending = status.pending || Boolean(busy);
  const Control = unstyled ? "button" : Button;
  return <Control {...props} type={type} disabled={pending || disabled} aria-busy={pending} className={className}>
    {pending && <Spinner className="mr-2 inline-block size-4 text-current" />}{pending ? pendingText ?? children : children}
  </Control>;
}
