import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { SURPLUS_TRANSFER_TAG } from "@/types";
import { z } from "zod";

const schema = z.object({
  transferIds: z.array(z.string()).min(1, "Cần ít nhất 1 phiếu"),
});

// Kho mô "Hoàn lại" 1 hoặc nhiều phiếu bàn giao Phòng tối CHƯA xử lý gì cả (chưa xếp kệ, và chưa kiểm tra
// luồng Đỏ HOẶC đã bấm kiểm tra nhưng chưa thực nhập gì — xem isTrivialInspection bên dưới) — dùng khi NV
// cấy mô bàn giao nhầm/muốn rút lại, hoặc Kho mô lỡ bấm "Xác nhận kiểm tra xong" nhầm phiếu mà chưa kịp
// nhập số liệu thật. Xoá phiếu (Transfer + TransferItem, và TransferInspection rỗng nếu có) — lô gốc
// trong Phòng tối giữ nguyên (vẫn còn inspectedAt nếu đã kiểm tra nhiễm), quay lại đúng trạng thái "đã
// kiểm tra xong nhưng chưa bàn giao" trên /my-dark-room, /product-handover của NV.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { transferIds } = parsed.data;

  const transfers = await prisma.transfer.findMany({
    where: { id: { in: transferIds } },
    include: {
      fromRoom: { select: { type: true, warehouseId: true } },
      items: { select: { id: true, confirmedAt: true } },
      inspection: {
        select: {
          id: true,
          items: { select: { contaminatedQuantity: true, unqualifiedQuantity: true, randomCheckPassRate: true } },
        },
      },
    },
  });

  if (transfers.length !== transferIds.length) {
    return NextResponse.json({ message: "Không tìm thấy một số phiếu bàn giao" }, { status: 404 });
  }

  // Chặn cứng — chỉ hoàn lại được phiếu CHƯA bị động tới ở bất kỳ đâu: đúng kho mình phụ trách, đang
  // PENDING, chưa có dòng nào được xác nhận xếp kệ (confirmedAt). Riêng bước kiểm tra (luồng Đỏ) vẫn cho
  // hoàn lại NẾU phiếu kiểm tra chưa thực sự ghi nhận gì — mọi dòng còn nguyên giá trị mặc định lúc mở
  // form (contaminatedQuantity=0, unqualifiedQuantity=0, randomCheckPassRate=100%, xem inspect-form.tsx)
  // — nghĩa là Kho mô mới bấm "Xác nhận kiểm tra xong" mà chưa thật sự đếm/nhập gì, không có Lot.quantity
  // nào bị trừ, không có bản ghi Phòng nhiễm nào được tạo (xem POST .../inspect bỏ qua item có
  // contaminatedQuantity <= 0) — hoàn lại lúc này an toàn tuyệt đối, không mất dữ liệu kiểm tra thật nào.
  // Chỉ cần MỘT dòng khác mặc định (có nhập số nhiễm/không đạt thật, hoặc đổi tỉ lệ kiểm tra ngẫu nhiên)
  // là coi như đã kiểm tra thật — chặn như cũ.
  const isTrivialInspection = (items: { contaminatedQuantity: number; unqualifiedQuantity: number; randomCheckPassRate: number }[]) =>
    items.every((i) => i.contaminatedQuantity === 0 && i.unqualifiedQuantity === 0 && i.randomCheckPassRate === 100);

  for (const t of transfers) {
    if (t.fromRoom?.type !== "PHONG_TOI" || t.fromRoom.warehouseId !== workplaceWarehouseId) {
      return NextResponse.json({ message: `Phiếu ${t.code} không thuộc kho bạn phụ trách` }, { status: 403 });
    }
    if (t.status !== "PENDING" || t.notes === SURPLUS_TRANSFER_TAG) {
      return NextResponse.json({ message: `Phiếu ${t.code} không ở trạng thái có thể hoàn lại` }, { status: 400 });
    }
    if (t.items.some((i) => i.confirmedAt)) {
      return NextResponse.json({ message: `Phiếu ${t.code} đã có lô được xếp kệ — không thể hoàn lại` }, { status: 409 });
    }
    if (t.inspection && !isTrivialInspection(t.inspection.items)) {
      return NextResponse.json({ message: `Phiếu ${t.code} đã được Kho mô kiểm tra và ghi nhận số liệu — không thể hoàn lại` }, { status: 409 });
    }
  }

  const inspectionIds = transfers.map((t) => t.inspection?.id).filter((id): id is string => !!id);

  await prisma.$transaction(async (tx) => {
    // Phiếu có kiểm tra "rỗng" (đủ điều kiện hoàn lại ở trên) — xoá luôn cả phiếu kiểm tra trước, tránh
    // vướng ràng buộc khoá ngoại khi xoá Transfer.
    if (inspectionIds.length > 0) {
      await tx.transferInspectionItem.deleteMany({ where: { inspectionId: { in: inspectionIds } } });
      await tx.transferInspection.deleteMany({ where: { id: { in: inspectionIds } } });
    }
    await tx.transferItem.deleteMany({ where: { transferId: { in: transferIds } } });
    await tx.transfer.deleteMany({ where: { id: { in: transferIds } } });
  });

  return NextResponse.json({ success: true });
}
