import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { upsertLot } from "@/lib/goods-receipt";
import { createAlert, createAlertForMarketSaleStaff } from "@/lib/inventory";
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
    })
  ),
});

const patchSchema = z.union([submitSchema, approveSchema]);

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
    }

    const submitItems = parsed.data.items;
    await prisma.$transaction(async (tx) => {
      for (const row of submitItems) {
        const item = itemById.get(row.itemId)!;
        await tx.rejectedGoodsClassificationItem.update({
          where: { id: row.itemId },
          data: {
            destroyQuantity: row.destroyQuantity,
            plantQuantity: item.rejectedQuantity - row.destroyQuantity,
            destroyPhotoUrls: row.destroyPhotoUrls,
            plantPhotoUrls: row.plantPhotoUrls,
          },
        });
      }
      await tx.rejectedGoodsClassification.update({
        where: { id },
        data: { status: "PENDING_APPROVAL", submittedAt: new Date() },
      });
      await tx.alert.updateMany({
        where: { type: "REJECTED_GOODS_CLASSIFICATION_PENDING", relatedId: id, status: "UNREAD" },
        data: { status: "READ", readAt: new Date() },
      });
    });

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

  await prisma.$transaction(async (tx) => {
    for (const row of approveItems) {
      const item = itemById.get(row.itemId)!;
      const plantQuantity = item.rejectedQuantity - row.destroyQuantity;
      const plantTypeCode = plantTypeCodeById.get(item.plantTypeId)!;

      const failedLot = await tx.lot.findFirst({
        where: { roomId: failedRoom.id, plantTypeId: item.plantTypeId, stageCode: item.stageCode, status: "ACTIVE" },
        orderBy: { enteredAt: "asc" },
      });
      if (failedLot) {
        await tx.lot.update({ where: { id: failedLot.id }, data: { quantity: { decrement: item.rejectedQuantity } } });
      }
      if (plantQuantity > 0) {
        await upsertLot(tx, plantRoom.id, item.plantTypeId, plantTypeCode, item.stageCode, plantQuantity, staffCode);
      }

      await tx.rejectedGoodsClassificationItem.update({
        where: { id: row.itemId },
        data: { destroyQuantity: row.destroyQuantity, plantQuantity, saleNote: row.saleNote },
      });
    }
    await tx.rejectedGoodsClassification.update({
      where: { id },
      data: { status: "APPROVED", approvedById: session.user.id, approvedAt: new Date() },
    });
  });

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
