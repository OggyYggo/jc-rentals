export const googleNextCookie = "kb-google-next";

export function accountReturnPath(value: string | null | undefined) {
  return value === "/account/profile" ? value : "/account/bookings";
}
