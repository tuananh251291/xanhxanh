import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type ShelfAttributeUpdateInput = {
  // undefined = không đổi, null = xoá gán, string = gán giá trị mới.
  plantTypeId?: string | null;
  assignedStaffId?: string | null;
};

export type ShelfAttributeUpdateData = {
  plantTypeId?: string | null;
  assignedStaffId?: string | null;
  sharedMotherPool?: null;
  allowedCodes?: string[];
};

export type ShelfAttributeUpdateResult =
  | { ok: true; data: ShelfAttributeUpdateData }
  | { ok: false; message: string };

// Trích từ PATCH /api/shelves/[id] (validate + build phần data cho plantTypeId/assignedStaffId) để
// dùng chung với luồng nhập Excel hàng loạt — tránh 2 nơi lệch quy tắc nghiệp vụ. KHÔNG xử lý phần
// đổi phòng (roomId) — route PATCH đơn lẻ vẫn tự xử lý case đó riêng vì nó ảnh hưởng thêm nhiều field
// khác (rotationGroupId, code kệ...) ngoài phạm vi hàm này.
export async function resolveShelfAttributeUpdate(
  tx: Tx,
  shelfId: string,
  input: ShelfAttributeUpdateInput
): Promise<ShelfAttributeUpdateResult> {
  const data: ShelfAttributeUpdateData = {};

  if (input.assignedStaffId !== undefined) {
    if (input.assignedStaffId) {
      const staff = await tx.user.findUnique({
        where: { id: input.assignedStaffId },
        select: { role: true, workplaceWarehouseId: true },
      });
      if (!staff || staff.role !== "CAY_MO") {
        return { ok: false, message: "Chỉ được gán nhân viên cấy mô (CAY_MO)" };
      }
      // NV cấy mô chỉ làm việc với đúng 1 kho sản xuất — không được gán kệ ngoài kho đã chỉ định.
      if (staff.workplaceWarehouseId) {
        const shelf = await tx.shelf.findUnique({ where: { id: shelfId }, select: { warehouseId: true } });
        if (shelf && shelf.warehouseId !== staff.workplaceWarehouseId) {
          return {
            ok: false,
            message: "Nhân viên cấy mô này đã được gán địa điểm làm việc ở kho khác — không thể gán kệ ngoài kho đó",
          };
        }
      }
      // Kệ chuyển từ "chung" sang "đã chia" thì không còn thuộc Kho quá hạn/đúng hạn nữa, cũng không
      // còn cấu hình Cho phép xếp.
      data.sharedMotherPool = null;
      data.allowedCodes = [];
    }
    data.assignedStaffId = input.assignedStaffId;
  }

  if (input.plantTypeId !== undefined) {
    // Đổi loại cây khi kệ đang còn lô của loại cây khác thì sẽ gây nhầm lẫn — chặn lại.
    if (input.plantTypeId) {
      const mismatched = await tx.lot.count({
        where: { shelfId, status: "ACTIVE", plantTypeId: { not: input.plantTypeId } },
      });
      if (mismatched > 0) {
        return { ok: false, message: "Kệ đang có lô của loại cây khác — chuyển/xử lý hết lô cũ trước khi đổi" };
      }
    }
    data.plantTypeId = input.plantTypeId;
  }

  return { ok: true, data };
}
