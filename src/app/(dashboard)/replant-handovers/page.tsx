import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sprout } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import ReplantHandoverBoard from "./replant-handover-board";

// "Bàn giao cây trồng" — Kho mô gộp các đề xuất Trồng lại đã được Admin duyệt (chưa bàn giao) thành 1
// phiếu, Nhân viên sản xuất cùng kho xác nhận đã nhận. Cả 2 vai trò dùng chung board, khác quyền
// tạo/xác nhận (xem replant-handover-board.tsx).
export default async function ReplantHandoversPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/replant-handovers")) || (role !== "KHO_MO" && role !== "NHAN_VIEN_SAN_XUAT")) {
    redirect("/dashboard");
  }

  const canCreate = role === "KHO_MO";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sprout className="w-6 h-6 text-primary-strong" /> Bàn giao cây trồng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {canCreate
            ? "Bàn giao các đề xuất Trồng lại đã được Admin duyệt cho Nhân viên sản xuất"
            : "Xác nhận đã nhận cây trồng do Kho mô bàn giao"}
        </p>
      </div>
      <ReplantHandoverBoard canCreate={canCreate} />
    </div>
  );
}
