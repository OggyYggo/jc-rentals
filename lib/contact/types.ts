export type ContactActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  firstName?: string;
  email?: string;
};

export const initialContactActionState: ContactActionState = { ok: false };
