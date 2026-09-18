import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import { ClipboardCheck } from "lucide-react";
import RootingQualityEvaluationBoard from "./rooting-quality-evaluation-board";

// Danh sách đánh giá chất lượng cây ra rễ ĐANG CHỜ của đúng NV Kỹ thuật đang đăng nhập — tự sinh hàng
// tuần (xem ensureWeeklyRootingQualityEvaluation, src/lib/rooting-quality-evaluation.ts), tự động giao
// thẳng nên không cần bước "Xác nhận nhận việc" nào — mỗi thẻ ở đây là 1 Nhóm tuần ra rễ đến hạn, bấm vào
// để nhập "Số đạt" cho từng loại cây/quy cách.
export default async function RootingQualityEvaluationPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "KY_THUAT" && !isAdminRole(role)) redirect("/dashboard");

  const evaluations = await prisma.rootingQualityEvaluation.findMany({
    where: role === "KY_THUAT" ? { assignedToId: session!.user.id, status: "PENDING" } : { status: "PENDING" },
    select: {
      id: true, code: true, weekStart: true,
      warehouse: { select: { name: true } },
      room: { select: { name: true } },
      rotationGroup: { select: { name: true } },
      assignedTo: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary-strong" /> Đánh giá chất lượng cây ra rễ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Đánh giá đạt/không đạt cho từng Nhóm tuần ra rễ đến hạn trước Thứ Sáu — Kho mô chỉ được bàn giao đúng phần đã đạt sang Kho thành phẩm.
        </p>
      </div>

      <RootingQualityEvaluationBoard evaluations={evaluations.map((e) => ({ ...e, weekStart: e.weekStart.toISOString() }))} />
    </div>
  );
}
