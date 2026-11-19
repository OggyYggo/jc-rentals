"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { PricingPlan } from "@/lib/plans/breakEven";

type ApplyPlanState = {
  plans: PricingPlan[];
  selectedCode: string;
  setSelectedCode: (code: string) => void;
  unavailable: boolean;
};
const Context = createContext<ApplyPlanState | null>(null);

export function ApplyPlanProvider({ children, plans, initialCode, unavailable }: {
  children: ReactNode; plans: PricingPlan[]; initialCode: string; unavailable: boolean;
}) {
  const [selectedCode, setSelectedCode] = useState(initialCode);
  return <Context.Provider value={{ plans, selectedCode, setSelectedCode, unavailable }}>{children}</Context.Provider>;
}

export function useApplyPlan() {
  const context = useContext(Context);
  if (!context) throw new Error("Apply plan controls must be inside ApplyPlanProvider.");
  return context;
}
