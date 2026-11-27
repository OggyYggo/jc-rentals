"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { useConnectionStatus } from "@/lib/connection/provider";
import { Spinner } from "./Spinner";

type Props = ComponentProps<"button"> & { pendingText?: string; busy?: boolean; unstyled?: boolean; needsConnection?: boolean };

export function SubmitButton({ children, pendingText, className, disabled, busy, unstyled, needsConnection = true, type = "submit", ...props }: Props) {
  const offline = useConnectionStatus() === "offline" && needsConnection;
  const status = useFormStatus();
  const pending = status.pending || Boolean(busy);
  const Control = unstyled ? "button" : Button;
  return <Control {...props} type={type} disabled={pending || disabled || offline} aria-busy={pending} className={className}>
    {pending && <Spinner className="mr-2 inline-block size-4 text-current" />}{pending ? pendingText ?? children : offline ? "Needs internet to continue" : children}
  </Control>;
}
