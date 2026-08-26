import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateGoodsReceiptCode } from "@/lib/codes";
import { getFinishedQualifiedRooms } from "@/lib/processing";
import { upsertLot, createPlannedGoodsReceipt } from "@/lib/goods-receipt";
import { createAlert } from "@/lib/inventory";
import { addDays } from "date-fns";
import { cellDate } from "@/lib/excel-import";
import { z } from "zod";

const confirmedItemSchema = z.object({
  plantTypeId: z.string().min(1),
  stageCode: z.enum(["T01", "T05", "T10"]),
  quantityDelivered: z.number().int().positive(),
  quantityRejected: z.number().int().min(0),
});

const plannedItemSchema = z.object({
  plantTypeId: z.string().min(1),
  stageCode: z.enum(["T01", "T05", "T10"]),
  estimatedQuantity: z.number().int().positive(),
});

const createSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("CONFIRMED"),
    supplierId: z.string().min(1),
    roomId: z.string().min(1),
    notes: z.string().optional(),
    items: z.array(confirmedItemSchema).min(1, "Cần ít nhất 1 dòng nhập hàng"),
  }),
  // Kế hoạch nhập kho — chưa có hàng thật, chỉ ước tính tổng số lượng mỗi SKU (chưa biết tỉ lệ đạt/không
  // đạt cho tới khi hàng về). Xem PATCH /api/goods-receipts/[id]/confirm để xác nhận số liệu thật. Nguồn
  // hàng là ĐÚNG 1 trong 2: NCC ngoài (supplierId) hoặc khu sản xuất nội bộ (productionGardenId).
  z.object({
    status: z.literal("PLANNED"),
    supplierId: z.string().min(1).optional(),
    productionGardenId: z.string().min(1).optional(),
    roomId: z.string().min(1),
    notes: z.string().optional(),
    expectedDate: z.string().min(1, "Cần nhập ngày dự kiến nhập kho"),
    items: z.array(plannedItemSchema).min(1, "Cần ít nhất 1 dòng kế hoạch"),
  }).refine((d) => !!d.supplierId !== !!d.productionGardenId, { message: "Chọn đúng 1 đơn vị cung cấp" }),
]);

// "Nhập hàng" — Kho thành phẩm ghi nhận 1 lần nhận hàng từ nhà cung cấp ngoài. Mỗi dòng tự chọn quy cách
// (T01/T05/T10) — phần "đạt" (quantityDelivered - quantityRejected) cộng thẳng vào 1 lô ACTIVE đúng quy
// cách đó trong Phòng đạt tiêu chuẩn đã chọn (tăng cả tồn thực tế lẫn tồn đạt tiêu chuẩn, giống pattern
// merge-hoặc-tạo-mới ở POST /api/processing-tickets); phần "không đạt" cộng vào 1 lô ACTIVE cùng quy
// cách trong Phòng theo dõi CÙNG kho đó (tăng tồn thực tế vì trang tồn thực tế cộng gộp mọi phòng của
// kho thành phẩm, nhưng KHÔNG tăng tồn đạt tiêu chuẩn vì trang tồn đạt tiêu chuẩn chỉ đọc Phòng đạt tiêu
// chuẩn — xem src/app/(dashboard)/inventory/dat-tieu-chuan/page.tsx). Đơn vị luôn tính theo cây.
//
// Nhánh "Kế hoạch nhập kho" (status PLANNED) KHÔNG cộng gì vào tồn thật — chỉ tạo 1 lô "ảo"
// (Lot.status = PLANNED) mỗi dòng, dùng để tính khả dụng TƯƠNG LAI cho đơn hàng có ngày xuất từ
// expectedDate trở đi (xem getQualifiedLots ở src/lib/order-availability.ts). Xác nhận số liệu thật ở
// PATCH /api/goods-receipts/[id]/confirm mới thực sự cộng vào tồn.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_THANH_PHAM" && session?.user?.role !== "QUAN_LY_KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ NV kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const data = parsed.data;

  if (!session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc (kho thành phẩm) — liên hệ Admin cấp cao" }, { status: 400 });
  }

  const [allRooms, creatingUser] = await Promise.all([
    getFinishedQualifiedRooms(),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } }),
  ]);

  // Nguồn hàng — supplierId luôn có với phiếu CONFIRMED (bắt buộc, xem createSchema); với PLANNED có thể
  // là supplierId HOẶC productionGardenId (đúng 1 trong 2, đã ràng buộc ở zod .refine() trên).
  let supplier: { id: string; isActive: boolean; allowsReturn: boolean; returnWindowDays: number | null } | null = null;
  if (data.supplierId) {
    supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId }, select: { id: true, isActive: true, allowsReturn: true, returnWindowDays: true } });
    if (!supplier || !supplier.isActive) {
      return NextResponse.json({ message: "Không tìm thấy nhà cung cấp" }, { status: 400 });
    }
  }
  if (data.status === "PLANNED" && data.productionGardenId) {
    const garden = await prisma.productionGarden.findUnique({ where: { id: data.productionGardenId }, select: { id: true, isActive: true } });
    if (!garden || !garden.isActive) {
      return NextResponse.json({ message: "Không tìm thấy khu sản xuất nội bộ" }, { status: 400 });
    }
  }
  // Chỉ được nhập hàng vào đúng kho thành phẩm mình làm việc (workplaceWarehouseId) — khác
  // getFinishedQualifiedRooms dùng ở nơi khác (VD Xử lý cây) vốn không giới hạn theo kho.
  const validRooms = allRooms.filter((r) => r.warehouseId === session.user.workplaceWarehouseId);
  const room = validRooms.find((r) => r.id === data.roomId);
  if (!room) {
    return NextResponse.json({ message: "Phòng không hợp lệ — chỉ được chọn Phòng đạt tiêu chuẩn của đúng kho thành phẩm bạn làm việc" }, { status: 400 });
  }

  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: Array.from(new Set(data.items.map((i) => i.plantTypeId))) } },
    select: { id: true, code: true, isActive: true },
  });
  const plantTypeById = new Map(plantTypes.map((p) => [p.id, p]));
  for (const item of data.items) {
    const pt = plantTypeById.get(item.plantTypeId);
    if (!pt || !pt.isActive) return NextResponse.json({ message: "Loại cây không hợp lệ" }, { status: 400 });
  }

  const staffCode = creatingUser?.code ?? "000";

  try {
    if (data.status === "PLANNED") {
      const expectedDate = cellDate(data.expectedDate);
      if (!expectedDate) {
        return NextResponse.json({ message: "Ngày dự kiến nhập kho không hợp lệ" }, { status: 400 });
      }

      const receipt = await prisma.$transaction(async (tx) =>
        createPlannedGoodsReceipt(tx, {
          supplierId: data.supplierId,
          productionGardenId: data.productionGardenId,
          roomId: data.roomId,
          createdById: session.user.id,
          notes: data.notes,
          expectedDate,
          staffCode,
          items: data.items.map((item) => ({
            plantTypeId: item.plantTypeId,
            plantTypeCode: plantTypeById.get(item.plantTypeId)!.code,
            stageCode: item.stageCode,
            estimatedQuantity: item.estimatedQuantity,
          })),
        })
      );

      return NextResponse.json(receipt, { status: 201 });
    }

    const roomWithWarehouse = await prisma.room.findUnique({ where: { id: data.roomId }, select: { warehouseId: true } });
    const rejectRoom = await prisma.room.findFirst({
      where: { warehouseId: roomWithWarehouse!.warehouseId, type: "PHONG_THEO_DOI", isActive: true },
      select: { id: true },
    });
    if (data.items.some((i) => i.quantityRejected > 0) && !rejectRoom) {
      return NextResponse.json({ message: "Kho này chưa có Phòng theo dõi — liên hệ Admin trước khi ghi nhận hàng không đạt" }, { status: 400 });
    }
    for (const item of data.items) {
      if (item.quantityRejected > item.quantityDelivered) {
        return NextResponse.json({ message: "Số lượng không đạt không được lớn hơn số lượng bàn giao" }, { status: 400 });
      }
    }

    const receipt = await prisma.$transaction(async (tx) => {
      const code = await generateGoodsReceiptCode(tx);
      const created = await tx.goodsReceipt.create({
        data: {
          code,
          supplierId: data.supplierId,
          roomId: data.roomId,
          createdById: session.user.id,
          notes: data.notes,
          status: "CONFIRMED",
          items: {
            create: data.items.map((i) => ({
              plantTypeId: i.plantTypeId,
              stageCode: i.stageCode,
              quantityDelivered: i.quantityDelivered,
              quantityRejected: i.quantityRejected,
              quantityPassed: i.quantityDelivered - i.quantityRejected,
            })),
          },
        },
      });

      for (const item of data.items) {
        const plantTypeCode = plantTypeById.get(item.plantTypeId)!.code;
        const quantityPassed = item.quantityDelivered - item.quantityRejected;
        if (quantityPassed > 0) {
          await upsertLot(tx, data.roomId, item.plantTypeId, plantTypeCode, item.stageCode, quantityPassed, staffCode);
        }
        if (item.quantityRejected > 0) {
          await upsertLot(tx, rejectRoom!.id, item.plantTypeId, plantTypeCode, item.stageCode, item.quantityRejected, staffCode);
        }
      }

      return created;
    });

    if (supplier!.allowsReturn && supplier!.returnWindowDays) {
      const deadline = addDays(receipt.createdAt, supplier!.returnWindowDays);
      await createAlert({
        type: "GOODS_RECEIPT_RETURN_DUE",
        title: "Phiếu nhập hàng cần kiểm tra trả hàng",
        message: `Phiếu ${receipt.code} cần kiểm tra trước ${deadline.toLocaleDateString("vi-VN")} — xem trang Nhập hàng`,
        targetRole: "KHO_THANH_PHAM",
        relatedId: receipt.id,
        relatedType: "GoodsReceipt",
      });
    }

    return NextResponse.json(receipt, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
    return NextResponse.json({ message }, { status: 400 });
  }
}
