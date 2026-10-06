import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isAttendanceRole } from "@/lib/attendance";
import AttendanceBoard from "./attendance-board";

// Chấm công của NV — chỉ NV Kho mô / Cấy mô / Kỹ thuật / Kho thành phẩm (ATTENDANCE_ROLES).
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAttendanceRole(role) || !(await isPageAllowed(role, "/attendance"))) redirect("/dashboard");
  const { tab } = await searchParams;
  return <AttendanceBoard userId={session!.user.id} userName={session!.user.name ?? ""} initialTab={tab === "requests" ? "requests" : "calendar"} />;
}
