import { OwnerShell } from "@/components/owner/owner-shell";
import { getOwnerContext } from "@/lib/owner-context";

export default async function OwnerLayout({ children }: LayoutProps<"/owner">) {
  const { user, owner } = await getOwnerContext();
  return <OwnerShell email={user.email ?? "Owner"} businessName={owner.business_name}>{children}</OwnerShell>;
}
