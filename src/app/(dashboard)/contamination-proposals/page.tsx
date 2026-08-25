import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole, isKhoThanhPhamRole } from "@/types";
import ContaminationProposalBoard from "./contamination-proposal-board";
import FinishedGoodsProposalSubmit from "@/components/shared/finished-goods-proposal-submit";
import { FINISHED_GOODS_ROOM_TYPES } from "@/lib/finished-goods";

export default async function ContaminationProposalsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/contamination-proposals"))) redirect("/dashboard");
  if (role !== "KHO_MO" && !isAdminRole(role) && !isKhoThanhPhamRole(role)) redirect("/dashboard");

  const canSubmit = role === "KHO_MO" || isKhoThanhPhamRole(role);
  const isFinishedGoods = isKhoThanhPhamRole(role);

  const [rooms, gardens] = await Promise.all([
    isFinishedGoods && session?.user?.workplaceWarehouseId
      ? prisma.room.findMany({
          where: { warehouseId: session.user.workplaceWarehouseId, type: { in: FINISHED_GOODS_ROOM_TYPES }, isActive: true },
          select: { id: true, name: true, type: true },
          orderBy: { type: "asc" },
        })
      : Promise.resolve([]),
    isFinishedGoods
      ? prisma.productionGarden.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-destructive" /> Đề xuất Trồng/Hủy
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {isFinishedGoods
            ? "Chọn phòng, chọn lô hàng thực tế, nhập số lượng Trồng/Hủy rồi gửi Admin duyệt."
            : canSubmit
              ? "Lịch sử các đề xuất đã gửi Admin duyệt — tạo đề xuất mới ở mục \"Kiểm tra kho nhiễm cá nhân\" trong Nhiệm vụ ngày"
              : "Duyệt các đề xuất Trồng/Hủy do Kho mô/Kho thành phẩm gửi lên"}
        </p>
      </div>

      {isFinishedGoods && <FinishedGoodsProposalSubmit rooms={rooms} gardens={gardens} />}

      <ContaminationProposalBoard canApprove={isAdminRole(role)} />
    </div>
  );
}
