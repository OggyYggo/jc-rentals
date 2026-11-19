export const REASON_MIN = 3;
export const REASON_MAX = 300;

export function reasonError(input: string, min = REASON_MIN, max = REASON_MAX, required = true) {
  const length = Array.from(input.trim()).length;
  if (!required && length === 0) return undefined;
  if (length < min || length > max) return `Please give a reason (${min} to ${max} characters).`;
}
