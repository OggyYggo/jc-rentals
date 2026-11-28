import { StaffWorkspace } from "@/components/staff/workspace";

export const instant = false;
export const metadata = { title: "Handover staff", robots: { index: false, follow: false } };

export default async function StaffHome({ searchParams }: PageProps<"/staff">) {
  const { business } = await searchParams;
  return <StaffWorkspace view="home" requested={typeof business === "string" ? business : undefined} />;
}
