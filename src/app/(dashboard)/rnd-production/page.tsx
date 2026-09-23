import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sprout } from "lucide-react";
import RndProductionBoard from "./rnd-production-board";

// Trang RIÊNG của Admin kỹ thuật — CHỈ role này (không mở cho ADMIN/SUPER_ADMIN, khác /rnd) vì đây là
// chỉ định cấy THẬT, có ảnh hưởng tồn kho thật (Lot/PlantingInstruction thật tại "Kho SX R&D") — khác
// hẳn "R&D" (TrialVariety/TrialCultivationRound, tách biệt hoàn toàn khỏi kho thật). Xem
// src/lib/rnd-instruction-warehouse.ts + POST /api/rnd-production/instructions. Giao được cho chính mình
// HOẶC cho NV cấy mô thật đã gán làm việc tại R&D (sửa 23/09/2026) — truyền sẵn code/tên của chính Admin
// kỹ thuật để board dùng làm lựa chọn mặc định "Chính mình" mà không cần gọi API riêng.
export default async function RndProductionPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") redirect("/dashboard");

  const currentUser = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { id: true, code: true, name: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sprout className="w-6 h-6 text-primary-strong" /> Cấy sản xuất R&D
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tạo chỉ định cấy bằng mã cây/môi trường có sẵn — giao cho chính bạn hoặc 1 NV cấy mô đã gán làm
          việc tại đây — dữ liệu thật, kì cấy tiếp theo tự tạo sẵn khi kì này dùng hết mẫu mẹ.
        </p>
      </div>

      <RndProductionBoard currentUser={currentUser} />
    </div>
  );
}
