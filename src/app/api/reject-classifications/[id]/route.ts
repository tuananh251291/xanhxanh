import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { upsertLot } from "@/lib/goods-receipt";
import { deductFromRoomFifo, InsufficientRoomStockError } from "@/lib/finished-goods";
import { createAlert, createAlertForMarketSaleStaff } from "@/lib/inventory";
import { POT_STAGE_CODE_LIST } from "@/lib/market-inspection";
import type { UserRole } from "@prisma/client";
import { z } from "zod";

const include = {
  transfer: { select: { code: true, transferredAt: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, code: true, name: true } },
  approvedBy: { select: { code: true, name: true } },
  items: { include: { plantType: { select: { code: true, name: true } } } },
} as const;

async function canView(userId: string, role: UserRole | null, warehouseId: string, workplaceWarehouseId: string | null): Promise<boolean> {
  if (isAdminRole(role)) return true;
  if (role === "DOI_TAC_VAN_HANH") return workplaceWarehouseId === warehouseId;
  if (role === "SALE") {
    const access = await prisma.retailWarehouseAccess.findUnique({ where: { userId_warehouseId: { userId, warehouseId } } });
    return !!access;
  }
  return false;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const classification = await prisma.rejectedGoodsClassification.findUnique({ where: { id }, include });
  if (!classification) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const allowed = await canView(session.user.id, session.user.role, classification.warehouseId, session.user.workplaceWarehouseId ?? null);
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  return NextResponse.json(classification);
}

const submitSchema = z.object({
  action: z.literal("submit"),
  items: z.array(
    z.object({
      itemId: z.string(),
      destroyQuantity: z.number().int().min(0),
      destroyPhotoUrls: z.array(z.string()).default([]),
      plantPhotoUrls: z.array(z.string()).default([]),
      // Quy cách chậu (S/M/L/C) của phần Trồng — bắt buộc khi phần Trồng > 0.
      plantStageCode: z.string().optional(),
    })
  ),
});

const approveSchema = z.object({
  action: z.literal("approve"),
  items: z.array(
    z.object({
      itemId: z.string(),
      destroyQuantity: z.number().int().min(0),
      saleNote: z.string().optional(),
      // QL thị trường sửa được quy cách chậu lúc duyệt — không truyền = giữ quy cách Đối tác đã chọn.
      plantStageCode: z.string().optional(),
    })
  ),
});

const patchSchema = z.union([submitSchema, approveSchema]);

function isPotStageCode(code: string | null | undefined): code is string {
  return !!code && (POT_STAGE_CODE_LIST as string[]).includes(code);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const classification = await prisma.rejectedGoodsClassification.findUnique({
    where: { id },
    include: { items: true, warehouse: { select: { id: true } } },
  });
  if (!classification) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const itemById = new Map(classification.items.map((it) => [it.id, it]));

  if (parsed.data.action === "submit") {
    const isOwner = session.user.role === "DOI_TAC_VAN_HANH" && session.user.workplaceWarehouseId === classification.warehouseId;
    if (!isOwner && !isAdminRole(session.user.role)) {
      return NextResponse.json({ message: "Bạn không có quyền gửi đề xuất này" }, { status: 403 });
    }
    if (classification.status !== "PENDING_CLASSIFICATION") {
      return NextResponse.json({ message: "Đề xuất đã được gửi trước đó" }, { status: 400 });
    }

    for (const row of parsed.data.items) {
      const item = itemById.get(row.itemId);
      if (!item) return NextResponse.json({ message: "Dòng không hợp lệ" }, { status: 400 });
      if (row.destroyQuantity > item.rejectedQuantity) {
        return NextResponse.json({ message: `Số lượng đề xuất huỷ (${item.stageCode}) vượt quá số không đạt` }, { status: 400 });
      }
      const plantQuantity = item.rejectedQuantity - row.destroyQuantity;
      if (row.destroyQuantity > 0 && row.destroyPhotoUrls.length === 0) {
        return NextResponse.json({ message: `Cần đính kèm ảnh cho phần đề xuất huỷ (${item.stageCode})` }, { status: 400 });
      }
      if (plantQuantity > 0 && row.plantPhotoUrls.length === 0) {
        return NextResponse.json({ message: `Cần đính kèm ảnh cho phần đề xuất trồng (${item.stageCode})` }, { status: 400 });
      }
      if (plantQuantity > 0 && !isPotStageCode(row.plantStageCode)) {
        return NextResponse.json({ message: `Chọn quy cách chậu (S/M/L/C) cho phần đề xuất trồng (${item.stageCode})` }, { status: 400 });
      }
    }
    if (new Set(parsed.data.items.map((r) => r.itemId)).size !== classification.items.length) {
      return NextResponse.json({ message: "Cần phân loại đủ mọi dòng không đạt" }, { status: 400 });
    }

    const [failedRoomForSubmit, plantTypesForSubmit] = await Promise.all([
      prisma.room.findFirst({ where: { warehouseId: classification.warehouseId, type: "PHONG_SAN_PHAM_KHONG_DAT", isActive: true }, select: { id: true } }),
      prisma.plantType.findMany({ where: { id: { in: classification.items.map((it) => it.plantTypeId) } }, select: { id: true, code: true } }),
    ]);
    if (!failedRoomForSubmit) {
      return NextResponse.json({ message: "Kho thị trường thiếu Phòng sản phẩm không đạt — liên hệ Admin kiểm tra lại kho" }, { status: 400 });
    }
    const submitPlantCodeById = new Map(plantTypesForSubmit.map((p) => [p.id, p.code]));

    const submitItems = parsed.data.items;
    try {
    await prisma.$transaction(async (tx) => {
      // Khoá trạng thái — bấm gửi 2 lần cùng lúc thì lần sau bị chặn (không tạm trừ tồn 2 lần).
      const locked = await tx.rejectedGoodsClassification.updateMany({
        where: { id, status: "PENDING_CLASSIFICATION" },
        data: { status: "PENDING_APPROVAL", submittedAt: new Date(), stockDeductedAt: new Date() },
      });
      if (locked.count === 0) throw new InsufficientRoomStockError("Đề xuất đã được gửi trước đó");
      for (const row of submitItems) {
        const item = itemById.get(row.itemId)!;
        // Tạm trừ NGAY toàn bộ số Không đạt (Hủy + Trồng luôn bằng đúng số này) khỏi Phòng sản phẩm không
        // đạt — lúc QL thị trường duyệt không trừ lại, chỉ cộng phần Trồng (theo số đã duyệt) vào Phòng cây trồng.
        await deductFromRoomFifo(tx, failedRoomForSubmit.id, item.plantTypeId, item.stageCode, item.rejectedQuantity, `${submitPlantCodeById.get(item.plantTypeId) ?? ""} ${item.stageCode} (Phòng sản phẩm không đạt)`);
        const plantQuantity = item.rejectedQuantity - row.destroyQuantity;
        await tx.rejectedGoodsClassificationItem.update({
          where: { id: row.itemId },
          data: {
            destroyQuantity: row.destroyQuantity,
            plantQuantity: item.rejectedQuantity - row.destroyQuantity,
            destroyPhotoUrls: row.destroyPhotoUrls,
            plantPhotoUrls: row.plantPhotoUrls,
            plantStageCode: plantQuantity > 0 ? row.plantStageCode : null,
          },
        });
      }
      await tx.alert.updateMany({
        where: { type: "REJECTED_GOODS_CLASSIFICATION_PENDING", relatedId: id, status: "UNREAD" },
        data: { status: "READ", readAt: new Date() },
      });
    });
    } catch (err) {
      if (err instanceof InsufficientRoomStockError) return NextResponse.json({ message: err.message }, { status: 409 });
      throw err;
    }

    await createAlertForMarketSaleStaff({
      warehouseId: classification.warehouseId,
      type: "REJECTED_GOODS_PROPOSAL_SUBMITTED",
      title: "Đề xuất phân loại hàng không đạt mới",
      message: `Có đề xuất Huỷ/Trồng mới cần duyệt cho phiếu nhận hàng — vào "Duyệt hàng không đạt" để xem chi tiết.`,
      relatedId: id,
      relatedType: "RejectedGoodsClassification",
    });

    return NextResponse.json({ success: true });
  }

  // action === "approve" — CHỈ đúng NV bán hàng có RetailWarehouseAccess tới kho này được duyệt, kể cả
  // Admin cũng KHÔNG duyệt thay được nữa (trước đây có quyền dự phòng) — tránh chồng chéo trách nhiệm,
  // việc duyệt Huỷ/Trồng thuộc hẳn về Sale phụ trách thị trường (khớp canApprove ở [id]/page.tsx).
  const isSaleApprover = session.user.role === "SALE" && (await prisma.retailWarehouseAccess.findUnique({
    where: { userId_warehouseId: { userId: session.user.id, warehouseId: classification.warehouseId } },
  }));
  if (!isSaleApprover) {
    return NextResponse.json({ message: "Bạn không có quyền duyệt đề xuất này" }, { status: 403 });
  }
  if (classification.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ message: "Đề xuất chưa được gửi hoặc đã được duyệt" }, { status: 400 });
  }

  const approveItems = parsed.data.items;
  for (const row of approveItems) {
    const item = itemById.get(row.itemId);
    if (!item) return NextResponse.json({ message: "Dòng không hợp lệ" }, { status: 400 });
    if (row.destroyQuantity > item.rejectedQuantity) {
      return NextResponse.json({ message: `Số lượng huỷ (${item.stageCode}) vượt quá số không đạt` }, { status: 400 });
    }
    if (row.plantStageCode !== undefined && !isPotStageCode(row.plantStageCode)) {
      return NextResponse.json({ message: `Quy cách chậu không hợp lệ (${item.stageCode})` }, { status: 400 });
    }
    // Phòng cây trồng chỉ chứa quy cách chậu — phần Trồng luôn phải có chậu (phiếu cũ chưa chọn thì QL chọn lúc duyệt).
    if (item.rejectedQuantity - row.destroyQuantity > 0 && !(row.plantStageCode ?? item.plantStageCode)) {
      return NextResponse.json({ message: `Chọn quy cách chậu (S/M/L/C) cho phần trồng (${item.stageCode})` }, { status: 400 });
    }
  }

  const [failedRoom, plantRoom] = await Promise.all([
    prisma.room.findFirst({ where: { warehouseId: classification.warehouseId, type: "PHONG_SAN_PHAM_KHONG_DAT", isActive: true }, select: { id: true } }),
    prisma.room.findFirst({ where: { warehouseId: classification.warehouseId, type: "PHONG_CAY_TRONG", isActive: true }, select: { id: true } }),
  ]);
  if (!failedRoom || !plantRoom) {
    return NextResponse.json({ message: "Kho thị trường thiếu Phòng sản phẩm không đạt/Phòng cây trồng — liên hệ Admin kiểm tra lại kho" }, { status: 400 });
  }

  const staffUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } });
  const staffCode = staffUser?.code ?? "000";
  const plantTypeCodeById = new Map(
    (
      await prisma.plantType.findMany({ where: { id: { in: classification.items.map((it) => it.plantTypeId) } }, select: { id: true, code: true } })
    ).map((p) => [p.id, p.code])
  );

  try {
  await prisma.$transaction(async (tx) => {
    // Khoá trạng thái — 2 người bấm duyệt cùng lúc thì người sau bị chặn (không trừ tồn 2 lần).
    const locked = await tx.rejectedGoodsClassification.updateMany({ where: { id, status: "PENDING_APPROVAL" }, data: { status: "APPROVED" } });
    if (locked.count === 0) throw new InsufficientRoomStockError("Đề xuất đã được duyệt trước đó");
    for (const row of approveItems) {
      const item = itemById.get(row.itemId)!;
      const plantQuantity = item.rejectedQuantity - row.destroyQuantity;
      const plantTypeCode = plantTypeCodeById.get(item.plantTypeId)!;

      const plantStageCode = plantQuantity > 0 ? (row.plantStageCode ?? item.plantStageCode) : null;

      // Phiếu đã tạm trừ lúc Đối tác gửi (stockDeductedAt) thì không trừ lại — Hủy + Trồng luôn bằng đúng số
      // Không đạt nên QL sửa số Hủy cũng không đổi tổng đã trừ. Phiếu cũ chưa tạm trừ thì trừ FIFO tại đây,
      // THIẾU thì báo lỗi.
      if (!classification.stockDeductedAt) {
        await deductFromRoomFifo(tx, failedRoom.id, item.plantTypeId, item.stageCode, item.rejectedQuantity, `${plantTypeCode} ${item.stageCode} (Phòng sản phẩm không đạt)`);
      }
      if (plantQuantity > 0) {
        await upsertLot(tx, plantRoom.id, item.plantTypeId, plantTypeCode, plantStageCode!, plantQuantity, staffCode);
      }

      await tx.rejectedGoodsClassificationItem.update({
        where: { id: row.itemId },
        data: { destroyQuantity: row.destroyQuantity, plantQuantity, saleNote: row.saleNote, plantStageCode },
      });
    }
    await tx.rejectedGoodsClassification.update({
      where: { id },
      data: { status: "APPROVED", approvedById: session.user.id, approvedAt: new Date() },
    });
  });
  } catch (err) {
    if (err instanceof InsufficientRoomStockError) return NextResponse.json({ message: err.message }, { status: 409 });
    throw err;
  }

  await createAlert({
    type: "REJECTED_GOODS_PROPOSAL_APPROVED",
    title: "Đề xuất phân loại hàng không đạt đã được duyệt",
    message: `NV bán hàng đã duyệt đề xuất Huỷ/Trồng phiếu ${classification.code}.`,
    userId: classification.createdById,
    relatedId: id,
    relatedType: "RejectedGoodsClassification",
  });

  return NextResponse.json({ success: true });
}
