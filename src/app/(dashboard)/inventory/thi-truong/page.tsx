import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import ThiTruongInventoryBoard from "./thi-truong-inventory-board";

// Tồn kho Kho thị trường cho Đối tác vận hành — đúng 3 phòng cố định lúc tạo kho (Phòng sản phẩm
// đạt/không đạt/cây trồng, xem enum WarehouseType.THI_TRUONG). Đối tác chỉ xem đúng kho mình phụ trách
// (session.user.workplaceWarehouseId), Admin cấp cao xem được tất cả Kho thị trường.
export default async function ThiTruongInventoryPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "DOI_TAC_VAN_HANH" && !isAdminRole(role)) redirect("/dashboard");
  if (!(await isPageAllowed(role, "/inventory/thi-truong"))) redirect("/dashboard");

  const isAdmin = isAdminRole(role);
  const warehouseId = session!.user.workplaceWarehouseId;
  if (!isAdmin && !warehouseId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Tồn kho</h1>
        <p className="text-text-secondary text-sm">
          Bạn chưa được gán Kho thị trường phụ trách — liên hệ Admin cấp cao.
        </p>
      </div>
    );
  }

  const rooms = await prisma.room.findMany({
    where: {
      type: { in: ["PHONG_SAN_PHAM_DAT", "PHONG_SAN_PHAM_KHONG_DAT", "PHONG_CAY_TRONG"] },
      isActive: true,
      ...(isAdmin ? {} : { warehouseId: warehouseId! }),
    },
    include: {
      lots: {
        // Ẩn lô đã hết số lượng — status ACTIVE không đủ vì lô hết hàng vẫn giữ ACTIVE, không bị xoá.
        where: { status: "ACTIVE", quantity: { gt: 0 } },
        select: {
          quantity: true,
          stageCode: true,
          plantTypeId: true,
          plantType: { select: { code: true, name: true } },
        },
      },
      warehouse: { select: { name: true } },
    },
    orderBy: [{ warehouse: { name: "asc" } }, { type: "asc" }],
  });

  const roomsData = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    warehouseName: r.warehouse.name,
    lots: r.lots,
  }));

  return <ThiTruongInventoryBoard rooms={roomsData} showWarehouseName={isAdmin} />;
}
