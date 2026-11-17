export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DOC_TYPES = [...IMAGE_TYPES, "application/pdf"] as const;
export const FUEL_TYPES = ["gasoline", "diesel", "hybrid", "electric"] as const;
export const MAX_CAR_YEAR = new Date().getFullYear() + 1;
export const UPLOADS = ["car_photos", "orcr", "license", "valid_id", "payment_qr"] as const;
export type UploadKind = (typeof UPLOADS)[number];
