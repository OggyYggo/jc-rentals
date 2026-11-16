import { Spinner } from "./Spinner";

export function LoadingOverlay({ message }: { message: string }) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-white/70 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-busy="true" aria-live="assertive"><div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 shadow-xl"><Spinner className="size-6 text-[#0B63CE]" /><p className="font-medium text-[#0F2342]">{message}</p></div></div>;
}
