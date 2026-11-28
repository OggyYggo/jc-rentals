import { StaffWorkspace } from "@/components/staff/workspace";

export const instant = false;

export default async function StaffTodayPage({ searchParams }: PageProps<"/staff/today">) {
  const { business } = await searchParams;
  return <StaffWorkspace view="today" requested={typeof business === "string" ? business : undefined} />;
}
