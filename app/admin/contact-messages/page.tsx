import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AdminHeading } from "@/components/admin/ui";
import { getAdminContext } from "@/lib/admin-context";
import { contactTopicLabels } from "@/lib/contact/schema";
import { exactTime } from "@/lib/audit/labels";

export const instant = false;

async function markReviewed(form: FormData) {
  "use server";
  const { supabase } = await getAdminContext();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const { error } = await supabase.from("contact_messages").update({ status: "in_progress" })
    .eq("id", id.data).eq("status", "new");
  if (error) throw new Error("Could not mark the message as reviewed.");
  revalidatePath("/admin/contact-messages");
}

export default async function ContactMessagesPage() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.from("contact_messages")
    .select("id,full_name,email,topic,message,created_at")
    .eq("status", "new").order("created_at").limit(50);
  return <>
    <AdminHeading title="New contact messages" description="Review the oldest messages first. Mark each message reviewed when you start handling it."/>
    {error ? <p role="alert">Could not load contact messages.</p> : !data.length ? <p>No new messages.</p> :
      <ul className="space-y-3">{data.map(row => <li key={row.id} className="rounded-xl border bg-white p-4 text-sm">
        <h2 className="font-semibold">{contactTopicLabels[row.topic as keyof typeof contactTopicLabels]} · {row.full_name}</h2>
        <p className="mt-1 break-all text-slate-600">{row.email}</p>
        <time className="text-xs text-slate-600" dateTime={row.created_at}>{exactTime(row.created_at)} Manila time</time>
        <p className="my-3 whitespace-pre-wrap break-words">{row.message}</p>
        <form action={markReviewed}><input type="hidden" name="id" value={row.id}/>
          <button className="rounded-md border px-3 py-2 font-medium">Mark reviewed</button>
        </form>
      </li>)}</ul>}
  </>;
}
