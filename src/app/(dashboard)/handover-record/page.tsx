import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import HandoverRecordBoard from "./handover-record-board";

export default async function HandoverRecordPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/handover-record"))) redirect("/dashboard");
  if (role !== "CAY_MO") redirect("/dashboard");

  // Vào trang này coi như đã xem kết quả kiểm tra — đánh dấu luôn các thông báo liên quan là Đã đọc.
  await prisma.alert.updateMany({
    where: { userId: session!.user.id, type: "INSPECTION_RESULT_READY", status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  });

  return <HandoverRecordBoard />;
}
