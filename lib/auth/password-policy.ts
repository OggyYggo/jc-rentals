export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_BYTES = 72;
export const passwordRules = {
  length: `Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_BYTES} characters (up to ${MAX_PASSWORD_BYTES} UTF-8 bytes).`,
  uppercase: "Add an uppercase letter.",
  lowercase: "Add a lowercase letter.",
  number: "Add a number.",
  symbol: "Add a symbol such as ! or @.",
  spaces: "Remove leading or trailing spaces.",
  personal: "Leave out your name and the part of your email before @.",
  common: "Choose a less common password without simple patterns.",
} as const;
export type PasswordRule = keyof typeof passwordRules;
export type PasswordIdentity = { email?: string; fullName?: string };

// Common breached passwords and their frequently reused base words.
const commonPasswords = new Set(`
123456 123456789 12345678 12345 1234567 1234567890 123123 111111 000000 1234
12345678910 123456789a 123456a 112233 121212 654321 666666 7777777 888888 696969
password password1 password123 passw0rd passwd pass123 passpass admin admin123 administrator
qwerty qwertyuiop qwerty123 qwerty12345 qwerty1 qwerty12 qwertyuiop123 asdfgh asdfghjkl asdf1234
zxcvbnm zxcvbnmlkjhgfdsa qazwsx 1q2w3e4r 1q2w3e4r5t 1qaz2wsx 1qazxsw2 1q2w3e 1q2w3e4r5t6y abc123
abcdef abcdefg abcdefgh abcdefghij iloveyou iloveu letmein welcome welcome1 login
monkey dragon football baseball basketball soccer hockey shadow sunshine princess
master superman batman trustno1 michael jordan jennifer charlie michelle daniel
jessica maggie hunter killer freedom computer internet secret whatever cheese
starwars pokemon hello hello123 loveme flower mustang zaq12wsx access kuyogbohol
`.trim().split(/\s+/));

function common(password: string) {
  const compact = password.toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = compact.replace(/\d+$/, "");
  if (commonPasswords.has(compact) || commonPasswords.has(base)) return true;
  if (/(.)\1{4,}/.test(compact) || /^(.{1,3})\1{2,}$/.test(compact)) return true;
  return ["01234567890", "9876543210", "abcdefghijklmnopqrstuvwxyz", "zyxwvutsrqponmlkjihgfedcba", "qwertyuiop", "asdfghjkl", "zxcvbnm"]
    .some(sequence => [...sequence].some((_, index) => {
      const pattern = sequence.slice(index, index + 5);
      return pattern.length === 5 && compact.includes(pattern);
    }));
}

export function validatePassword(password: string, { email = "", fullName = "" }: PasswordIdentity = {}): PasswordRule[] {
  const normalized = password.toLowerCase().normalize("NFC");
  const emailName = email.trim().toLowerCase().normalize("NFC").split("@")[0];
  const name = fullName.trim().toLowerCase().normalize("NFC");
  const names = [name, ...name.split(/\s+/)].filter(part => part.length >= 3);
  const failed: Record<PasswordRule, boolean> = {
    length: Array.from(password).length < MIN_PASSWORD_LENGTH || new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES,
    uppercase: !/[A-Z]/.test(password),
    lowercase: !/[a-z]/.test(password),
    number: !/[0-9]/.test(password),
    symbol: !Array.from(password).some(character => "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~".includes(character)),
    spaces: password !== password.trim(),
    personal: (Boolean(emailName) && normalized.includes(emailName)) || names.some(part => normalized.includes(part)),
    common: common(password),
  };
  return (Object.keys(passwordRules) as PasswordRule[]).filter(rule => failed[rule]);
}
