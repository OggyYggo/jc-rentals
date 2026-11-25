"use client";

import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import { passwordRules, type PasswordRule } from "@/lib/auth/password-policy";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  failures?: PasswordRule[];
  mismatch?: boolean;
  disabled?: boolean;
};

export function PasswordField({ label, value, onChange, failures, mismatch, disabled }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const rules = Object.entries(passwordRules) as [PasswordRule, string][];
  const passed = value && failures ? rules.length - failures.length : 0;
  return <div className="space-y-2 text-xs text-[#43536a]">
    <label htmlFor={id} className="font-medium">{label}</label>
    <div className="flex rounded-lg border border-[#dfe5ec] bg-white focus-within:border-[#6e91e8]">
      <input id={id} required disabled={disabled} autoComplete="new-password" autoCapitalize="none" spellCheck={false}
        type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)}
        aria-describedby={failures ? `${id}-rules` : mismatch ? `${id}-match` : undefined}
        aria-invalid={mismatch || undefined}
        className="h-10 min-w-0 flex-1 rounded-lg px-3 text-sm text-[#26364e] outline-none" />
      <button type="button" disabled={disabled} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
        onClick={() => setVisible(!visible)} className="px-3 font-semibold text-[#2457d6]">
        {visible ? "Hide" : "Show"}
      </button>
    </div>
    {failures && <div id={`${id}-rules`} className="space-y-2">
      <div role="progressbar" aria-label="Password strength" aria-valuemin={0} aria-valuemax={rules.length} aria-valuenow={passed}
        className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${passed === rules.length ? "bg-green-700" : "bg-[#2457d6]"}`} style={{ width: `${100 * passed / rules.length}%` }} />
      </div>
      <ul className="grid gap-1 text-[11px] leading-4">
        {rules.map(([rule, text]) => {
          const meetsRule = Boolean(value) && !failures.includes(rule);
          return <li key={rule} className={`flex items-start gap-1.5 ${meetsRule ? "text-green-800" : "text-[#53637a]"}`}>
            {meetsRule ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
            <span><span className="sr-only">{meetsRule ? "Met. " : "Required. "}</span>{text}</span>
          </li>;
        })}
      </ul>
    </div>}
    {mismatch && <p id={`${id}-match`} className="text-red-800">The passwords do not match.</p>}
  </div>;
}
