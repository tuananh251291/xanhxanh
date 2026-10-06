import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getApproverWarehouseIds, isAttendanceHr } from "@/lib/attendance-server";
import ApprovalsBoard from "./approvals-board";

// Duyệt đơn chấm công — quản lý khu (người duyệt cấp 1 được HCNS gán ở Cài đặt khu) và HCNS (cấp 2).
export default async function AttendanceApprovalsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isHr = isAttendanceHr(session.user.role);
  if (!isHr && (await getApproverWarehouseIds(session.user.id)).length === 0) redirect("/dashboard");
  return <ApprovalsBoard isHr={isHr} />;
}
