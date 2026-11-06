export function makeShortCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const values = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}
