import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { QUALITY_DEFECT_COUNT, sumDefects } from "@/lib/quality-defects";
import { deductFromRoomFifo } from "@/lib/finished-goods";

// [Lỗi 1..Lỗi 5] — xem QUALITY_DEFECT_LABELS (src/lib/quality-defects.ts).
const schema = z.object({
  defectQuantities: z.array(z.number().int().min(0)).length(QUALITY_DEFECT_COUNT),
});

// "Kiểm tra" + "Trả hàng" — chỉ áp dụng cho dòng nhập hàng của nhà cung cấp cho phép trả hàng
// (Supplier.allowsReturn). Kho thành phẩm kiểm tra lại trong vòng Supplier.returnWindowDays ngày kể từ
// ngày nhập, phát hiện thêm cây không đạt trong số đã tính "đạt" lúc nhập, phân loại theo 5 loại lỗi
// (Lỗi 1..Lỗi 5) — bấm "Xác nhận gửi trả NCC" sẽ trừ thẳng TỔNG 5 loại lỗi khỏi lô ĐÚNG QUY CÁCH
// (item.stageCode) đã cộng ở Phòng đạt tiêu chuẩn lúc nhập hàng (giảm cả tồn thực tế lẫn tồn đạt tiêu
// chuẩn vì hàng rời kho thật, khác phần "không đạt" ban đầu vẫn nằm nguyên trong Phòng theo dõi). Cả 2 số
// lượng = 0 vẫn hợp lệ — nghĩa là đã kiểm tra, không phát hiện thêm lỗi.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_THANH_PHAM" && session?.user?.role !== "QUAN_LY_KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ NV kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { defectQuantities } = parsed.data;
  const returnQuantity = sumDefects(defectQuantities);
  // Giữ 2 cột cũ để dữ liệu trước/sau khi đổi sang 5 loại lỗi đọc chung được: Lỗi 1 = Nhiễm, Lỗi 2..5 = Không đạt.
  const returnQuantityNhiem = defectQuantities[0];
  const returnQuantityKhongDat = returnQuantity - returnQuantityNhiem;

  const item = await prisma.goodsReceiptItem.findUnique({
    where: { id },
    include: {
      receipt: {
        select: { roomId: true, room: { select: { warehouseId: true } }, supplier: { select: { allowsReturn: true } } },
      },
    },
  });
  if (!item) return NextResponse.json({ message: "Không tìm thấy dòng nhập hàng" }, { status: 404 });
  if (item.receipt.room.warehouseId !== session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Dòng này thuộc kho thành phẩm khác — không đúng địa điểm làm việc của bạn" }, { status: 403 });
  }
  if (!item.receipt.supplier?.allowsReturn) {
    return NextResponse.json({ message: "Nhà cung cấp này không cho phép trả hàng" }, { status: 400 });
  }
  if (item.returnedAt) {
    return NextResponse.json({ message: "Dòng này đã được kiểm tra" }, { status: 400 });
  }
  if (returnQuantity > item.quantityPassed) {
    return NextResponse.json({ message: "Tổng số lượng trả hàng không được lớn hơn số lượng đạt lúc nhập" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Khoá dòng — 2 người bấm cùng lúc thì người sau bị chặn (không trừ tồn 2 lần).
      const locked = await tx.goodsReceiptItem.updateMany({ where: { id, returnedAt: null }, data: { returnedAt: new Date() } });
      if (locked.count === 0) throw new Error("Dòng này đã được kiểm tra");
      // Trừ FIFO qua các lô cùng phòng/mã cây/quy cách (trước đây chỉ xét lô cũ nhất — tồn chia nhiều lô thì
      // báo thiếu sai); thiếu tồn thì báo lỗi.
      await deductFromRoomFifo(tx, item.receipt.roomId, item.plantTypeId, item.stageCode, returnQuantity, "Tồn thực tế không đủ để trả hàng — số cây đã cộng lúc nhập có thể đã được xuất bán");

      await tx.goodsReceiptItem.update({
        where: { id },
        data: { returnDefectQuantities: defectQuantities, returnQuantityNhiem, returnQuantityKhongDat, returnQuantity, returnedAt: new Date(), returnedById: session.user.id },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
    return NextResponse.json({ message }, { status: 400 });
  }
}
