import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { SURPLUS_TRANSFER_TAG } from "@/types";
import { z } from "zod";

const schema = z.object({
  transferIds: z.array(z.string()).min(1, "Cần ít nhất 1 phiếu"),
});

// Kho mô "Hoàn lại" 1 hoặc nhiều phiếu bàn giao Phòng tối CHƯA xử lý gì cả (chưa kiểm tra luồng Đỏ, chưa
// xếp kệ) — dùng khi NV cấy mô bàn giao nhầm/muốn rút lại. Chỉ xoá phiếu (Transfer + TransferItem) — lô
// gốc trong Phòng tối giữ nguyên (vẫn còn inspectedAt nếu đã kiểm tra), quay lại đúng trạng thái "đã
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
      inspection: { select: { id: true } },
    },
  });

  if (transfers.length !== transferIds.length) {
    return NextResponse.json({ message: "Không tìm thấy một số phiếu bàn giao" }, { status: 404 });
  }

  // Chặn cứng — chỉ hoàn lại được phiếu CHƯA bị động tới ở bất kỳ đâu: đúng kho mình phụ trách, đang
  // PENDING, chưa có dòng nào được xác nhận xếp kệ (confirmedAt), và (luồng Đỏ) chưa được Kho mô kiểm
  // tra (inspection null) — khớp đúng 2 chỗ nút "Hoàn lại" xuất hiện (cạnh "Kiểm tra"/"Sắp xếp vào kho",
  // đều là trạng thái chưa xử lý gì).
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
    if (t.inspection) {
      return NextResponse.json({ message: `Phiếu ${t.code} đã được Kho mô kiểm tra — không thể hoàn lại` }, { status: 409 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.transferItem.deleteMany({ where: { transferId: { in: transferIds } } });
    await tx.transfer.deleteMany({ where: { id: { in: transferIds } } });
  });

  return NextResponse.json({ success: true });
}
