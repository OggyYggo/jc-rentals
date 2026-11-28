import { createClient } from "@/lib/supabase/server";
import { lookupPickup } from "@/lib/pickup/lookup";
import { bookingIdPattern } from "@/lib/pickup/model";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ result: "NOT_VALID" }, { status: 401, headers });
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.slice(0, 65) : null;
  const code = typeof body?.code === "string" ? body.code.slice(0, 7) : null;
  if ((token === null) === (code === null)) return Response.json({ result: "NOT_VALID" }, { headers });
  try {
    if (body.staffOwner !== undefined) {
      if (typeof body.staffOwner !== "string" || !bookingIdPattern.test(body.staffOwner)) return Response.json({ result: "NOT_VALID" }, { headers });
      const { data, error } = await db.rpc("staff_lookup_pickup_pass", { p_owner:body.staffOwner,p_token:token,p_code:code });
      if (error) throw error;
      return Response.json(data, { headers });
    }
    const result = await lookupPickup(db, request.headers, token !== null ? { token } : { code: code! });
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: "Pickup lookup is temporarily unavailable." }, { status: 503, headers });
  }
}
