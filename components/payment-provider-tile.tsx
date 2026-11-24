import { paymentProviders, type PaymentProvider } from "@/lib/payments/providers";

export function PaymentProviderTile({ provider }: { provider: PaymentProvider }) {
  const brand = paymentProviders[provider];
  return <span aria-hidden="true" style={{ backgroundColor: brand.color }}
    className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white">
    {brand.letter}
  </span>;
}
