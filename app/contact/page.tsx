import { redirect } from "next/navigation";

// The former contact page duplicated the owner application form.
export default function ContactPage() {
  redirect("/apply");
}
