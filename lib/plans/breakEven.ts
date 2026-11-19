export type PricingPlan = {
  id: string; code: string; name: string; tagline: string | null; price_php: number;
  max_active_vehicles: number; commission_rate: number; support_level: string;
  features: string[]; is_featured: boolean; sort_order: number;
};

export function breakEvenBookings(price: number, higherRate: number, lowerRate: number) {
  const difference = higherRate - lowerRate;
  return difference > 0 ? price / difference : null;
}

export function ownerEarningsExample(dailyRate: number, days: number, commissionRate: number) {
  const gross = dailyRate * days;
  return { gross, commission: gross * commissionRate, earnings: gross * (1 - commissionRate) };
}

export function peso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
}
