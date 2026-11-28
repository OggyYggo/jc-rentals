"use client";

import { useId } from "react";

export function SegmentedTabs<T extends string>({ label, tabs, value, onChange, children }: {
  label: string;
  tabs: readonly { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  const index = tabs.findIndex(tab => tab.key === value);
  return <>
    <div role="tablist" aria-label={label} className="relative grid rounded-xl bg-[#EAF4FF] p-1"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        onChange(tabs[next].key);
      }}>
      <span aria-hidden className="pointer-events-none absolute inset-x-1 inset-y-1">
        <span className="block h-full rounded-lg bg-white shadow-sm motion-safe:transition-transform motion-safe:duration-200"
          style={{ width: `${100 / tabs.length}%`, transform: `translateX(${index * 100}%)` }} />
      </span>
      {tabs.map(tab => <button key={tab.key} id={`${id}-${tab.key}`} type="button" role="tab" aria-selected={value === tab.key}
        aria-controls={`${id}-panel-${tab.key}`} tabIndex={value === tab.key ? 0 : -1} onClick={() => onChange(tab.key)}
        className="relative min-h-11 rounded-lg px-1.5 text-[13px] font-semibold text-[#5B6F89] aria-selected:text-[#0A47B1] focus-visible:outline-2 focus-visible:outline-[#0A47B1]">{tab.label}</button>)}
    </div>
    {tabs.map(tab => <div key={tab.key} role="tabpanel" hidden={tab.key !== value} id={`${id}-panel-${tab.key}`}
      aria-labelledby={`${id}-${tab.key}`} tabIndex={0} className="mt-3 rounded focus-visible:outline-2 focus-visible:outline-[#0A47B1]">
      {tab.key === value && children}
    </div>)}
  </>;
}
