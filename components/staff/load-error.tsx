"use client";

import { useRouter } from "next/navigation";
import { staffAction, staffCard } from "./shared";

export function StaffLoadError({ message }: { message: string }) {
  const router = useRouter();
  return <div className={`${staffCard} space-y-2`}><p role="status">{message}</p>
    <button type="button" className={staffAction} onClick={() => router.refresh()}>Try again</button>
  </div>;
}
