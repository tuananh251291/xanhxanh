import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { isKhoThanhPhamRole } from "@/types";
import RndWarehouseHandoverBoard from "./rnd-warehouse-handover-board";

// Nhận bàn giao sản phẩm R&D (Admin kỹ thuật gửi từ "Kho SX R&D") — dành cho Kho mô (kho đích là khu
// sản xuất, chọn giàn kệ) và Kho thành phẩm (kho đích là kho thành phẩm, chọn phòng) — xem
// GET/POST /api/rnd-warehouse-handover/*.
export default async function RndWarehouseHandoverPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "KHO_MO" && !isKhoThanhPhamRole(role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-primary-strong" /> Nhận bàn giao R&D
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Xác nhận nhận sản phẩm R&D (Admin kỹ thuật gửi từ Kho SX R&D) vào tồn kho của cơ sở bạn.
        </p>
      </div>

      <RndWarehouseHandoverBoard isKhoMo={role === "KHO_MO"} />
    </div>
  );
}
