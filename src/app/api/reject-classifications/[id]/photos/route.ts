import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { uploadRejectClassificationPhoto, deleteRejectClassificationPhoto } from "@/lib/reject-classification-storage";
import { MAX_DATA_URL_LENGTH } from "@/lib/reject-classification-constants";
import type { UserRole } from "@prisma/client";
import { z } from "zod";

const photoField = z
  .string()
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Ảnh không hợp lệ")
  .refine((v) => v.length <= MAX_DATA_URL_LENGTH, "Ảnh quá lớn, vui lòng chụp lại");

const postSchema = z.object({
  itemId: z.string(),
  kind: z.enum(["destroy", "plant"]),
  dataUrl: photoField,
});

async function loadOwnedItem(classificationId: string, itemId: string, role: UserRole | null, workplaceWarehouseId: string | null) {
  const classification = await prisma.rejectedGoodsClassification.findUnique({
    where: { id: classificationId },
    include: { items: true },
  });
  if (!classification) return { error: NextResponse.json({ message: "Không tìm thấy" }, { status: 404 }) };

  const isOwner = role === "DOI_TAC_VAN_HANH" && workplaceWarehouseId === classification.warehouseId;
  if (!isOwner && !isAdminRole(role)) {
    return { error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }) };
  }
  if (classification.status !== "PENDING_CLASSIFICATION") {
    return { error: NextResponse.json({ message: "Đề xuất đã gửi — không thể sửa ảnh" }, { status: 400 }) };
  }
  const item = classification.items.find((it) => it.id === itemId);
  if (!item) return { error: NextResponse.json({ message: "Dòng không hợp lệ" }, { status: 400 }) };

  return { classification, item };
}

// Thêm 1 ảnh vào destroyPhotoUrls/plantPhotoUrls của 1 dòng — nhiều ảnh/dòng, không giới hạn số lượng
// (chỉ giới hạn dung lượng mỗi ảnh qua MAX_DATA_URL_LENGTH).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  const loaded = await loadOwnedItem(id, parsed.data.itemId, session.user.role, session.user.workplaceWarehouseId ?? null);
  if ("error" in loaded) return loaded.error;
  const { item } = loaded;

  try {
    const path = `${id}/${item.id}/${parsed.data.kind}-${Date.now()}`;
    const url = await uploadRejectClassificationPhoto(parsed.data.dataUrl, path);
    const field = parsed.data.kind === "destroy" ? "destroyPhotoUrls" : "plantPhotoUrls";
    const updated = await prisma.rejectedGoodsClassificationItem.update({
      where: { id: item.id },
      data: { [field]: [...(field === "destroyPhotoUrls" ? item.destroyPhotoUrls : item.plantPhotoUrls), url] },
      select: { destroyPhotoUrls: true, plantPhotoUrls: true },
    });
    return NextResponse.json({ url, ...updated }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tải ảnh lên thất bại";
    return NextResponse.json({ message }, { status: 500 });
  }
}

const deleteSchema = z.object({
  itemId: z.string(),
  kind: z.enum(["destroy", "plant"]),
  url: z.string(),
});

// Gỡ 1 ảnh đã đính kèm trước khi "Gửi đề xuất" (đính nhầm ảnh) — xoá cả khỏi Supabase Storage lẫn mảng
// URL trong DB.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const loaded = await loadOwnedItem(id, parsed.data.itemId, session.user.role, session.user.workplaceWarehouseId ?? null);
  if ("error" in loaded) return loaded.error;
  const { item } = loaded;

  const field = parsed.data.kind === "destroy" ? "destroyPhotoUrls" : "plantPhotoUrls";
  const current = field === "destroyPhotoUrls" ? item.destroyPhotoUrls : item.plantPhotoUrls;
  if (!current.includes(parsed.data.url)) return NextResponse.json({ message: "Ảnh không tồn tại" }, { status: 404 });

  await deleteRejectClassificationPhoto(parsed.data.url).catch(() => {});
  await prisma.rejectedGoodsClassificationItem.update({
    where: { id: item.id },
    data: { [field]: current.filter((u) => u !== parsed.data.url) },
  });

  return NextResponse.json({ success: true });
}
