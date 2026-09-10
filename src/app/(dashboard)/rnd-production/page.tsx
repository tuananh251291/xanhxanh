import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sprout } from "lucide-react";
import RndProductionBoard from "./rnd-production-board";

// Trang RIÊNG của Admin kỹ thuật — CHỈ role này (không mở cho ADMIN/SUPER_ADMIN, khác /rnd) vì đây là
// chỉ định cấy THẬT, có ảnh hưởng tồn kho thật (Lot/PlantingInstruction thật tại "Kho SX R&D") — khác
// hẳn "R&D" (TrialVariety/TrialCultivationRound, tách biệt hoàn toàn khỏi kho thật). Xem
// src/lib/rnd-instruction-warehouse.ts + POST /api/rnd-production/instructions.
export default async function RndProductionPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sprout className="w-6 h-6 text-primary-strong" /> Cấy sản xuất R&D
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tự tạo chỉ định cấy cho chính bạn bằng mã cây/môi trường có sẵn — dữ liệu thật, kì cấy tiếp theo
          tự tạo sẵn khi kì này dùng hết mẫu mẹ.
        </p>
      </div>

      <RndProductionBoard />
    </div>
  );
}
