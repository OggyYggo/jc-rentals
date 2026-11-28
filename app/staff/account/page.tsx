import { StaffWorkspace } from "@/components/staff/workspace";

export const instant = false;

export default async function StaffAccountPage({ searchParams }: PageProps<"/staff/account">) {
  const { business } = await searchParams;
  return <StaffWorkspace view="account" requested={typeof business === "string" ? business : undefined} />;
}
