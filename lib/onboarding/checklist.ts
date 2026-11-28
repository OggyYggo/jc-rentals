export type ChecklistVehicle = {
  is_active: boolean;
  car_photos: unknown[];
  car_rates: { daily_rate: number | string | null }[];
};

export function hasSetupVehicle(cars: ChecklistVehicle[], activeOnly = false) {
  return cars.some(car => (!activeOnly || car.is_active) && car.car_photos.length >= 3
    && car.car_rates.some(rate => Number(rate.daily_rate) > 0));
}

export function hasStartingCredits(invoice: boolean, available: number | null, minimum: number | null) {
  return invoice || (available !== null && minimum !== null ? available >= minimum : null);
}

export function qrChecklistState(options: { qr_path: string; verified: boolean; rejection_reason: string | null }[],
  legacy: { payment_qr_path: string | null; payment_qr_verified: boolean } | null) {
  if (!options.length) {
    if (!legacy) return null;
    if (!legacy.payment_qr_path) return "todo";
    return legacy.payment_qr_verified ? "done" : "review";
  }
  if (options.some(option => option.qr_path && option.verified)) return "done";
  return options.some(option => option.qr_path && !option.rejection_reason) ? "review" : "todo";
}
