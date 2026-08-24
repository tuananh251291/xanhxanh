import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  returnQuantityNhiem: z.number().int().min(0),
  returnQuantityKhongDat: z.number().int().min(0),
});

// "Kiểm tra" + "Trả hàng" — chỉ áp dụng cho dòng nhập hàng của nhà cung cấp cho phép trả hàng
// (Supplier.allowsReturn). Kho thành phẩm kiểm tra lại trong vòng Supplier.returnWindowDays ngày kể từ
// ngày nhập, phát hiện thêm cây không đạt trong số đã tính "đạt" lúc nhập, phân loại theo lỗi Nhiễm/Không
// đạt tiêu chuẩn — bấm "Xác nhận gửi trả NCC" sẽ trừ thẳng TỔNG 2 loại lỗi khỏi lô ĐÚNG QUY CÁCH
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
  const { returnQuantityNhiem, returnQuantityKhongDat } = parsed.data;
  const returnQuantity = returnQuantityNhiem + returnQuantityKhongDat;

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
  if (!item.receipt.supplier.allowsReturn) {
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
      if (returnQuantity > 0) {
        const lot = await tx.lot.findFirst({
          where: { roomId: item.receipt.roomId, plantTypeId: item.plantTypeId, stageCode: item.stageCode, status: "ACTIVE" },
          orderBy: { enteredAt: "asc" },
        });
        if (!lot || lot.quantity < returnQuantity) {
          throw new Error("Tồn thực tế không đủ để trả hàng — số cây đã cộng lúc nhập có thể đã được xuất bán");
        }
        await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: returnQuantity } } });
      }

      await tx.goodsReceiptItem.update({
        where: { id },
        data: { returnQuantityNhiem, returnQuantityKhongDat, returnQuantity, returnedAt: new Date(), returnedById: session.user.id },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
    return NextResponse.json({ message }, { status: 400 });
  }
}
