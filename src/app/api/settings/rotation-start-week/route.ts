import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSystemConfig } from "@/lib/inventory";
import { isoWeekStringToMonday } from "@/lib/week-rotation";
import { ROTATION_START_WEEK_KEY_BY_KIND } from "@/lib/rotation-epoch";
import { z } from "zod";

// "Tuần khởi đầu của Nhóm 1" (Nhóm tuần ra rễ hoặc Nhóm tuần mẫu mẹ, phân biệt bằng "kind") — chỉ
// SUPER_ADMIN mới xem/sửa được, giống hệt mức quyền của /api/shelf-groups (khác ADMIN thường).
// Có warehouseId = giá trị RIÊNG của kho đó (Warehouse.motherRotationStartWeek / rootingRotationStartWeek,
// startWeek null = bỏ giá trị riêng, quay về dùng giá trị chung). Không có warehouseId = giá trị CHUNG
// (SystemConfig) áp cho mọi kho chưa đặt riêng. Xem src/lib/rotation-epoch.ts.
const kindSchema = z.enum(["RA_RE", "MAU_ME"]);
const FIELD_BY_KIND = { RA_RE: "rootingRotationStartWeek", MAU_ME: "motherRotationStartWeek" } as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const kindParsed = kindSchema.safeParse(params.get("kind"));
  if (!kindParsed.success) return NextResponse.json({ message: "Thiếu hoặc sai tham số kind" }, { status: 400 });
  const kind = kindParsed.data;

  const globalStartWeek = (await getSystemConfig(ROTATION_START_WEEK_KEY_BY_KIND[kind], "")) || null;
  const warehouseId = params.get("warehouseId");
  if (!warehouseId) return NextResponse.json({ startWeek: globalStartWeek, globalStartWeek });

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { motherRotationStartWeek: true, rootingRotationStartWeek: true },
  });
  if (!warehouse) return NextResponse.json({ message: "Không tìm thấy kho" }, { status: 404 });
  return NextResponse.json({ startWeek: warehouse[FIELD_BY_KIND[kind]], globalStartWeek });
}

const patchSchema = z.object({
  kind: kindSchema,
  // Định dạng input type="week": "YYYY-Www" (VD "2026-W27"). null chỉ hợp lệ khi có warehouseId (bỏ giá
  // trị riêng của kho).
  startWeek: z.string().regex(/^\d{4}-W\d{2}$/, "Định dạng tuần không hợp lệ").nullable(),
  warehouseId: z.string().min(1).optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { kind, startWeek, warehouseId } = parsed.data;

  if (startWeek && !isoWeekStringToMonday(startWeek)) {
    return NextResponse.json({ message: "Tuần không hợp lệ" }, { status: 400 });
  }

  if (warehouseId) {
    const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true } });
    if (!warehouse) return NextResponse.json({ message: "Không tìm thấy kho" }, { status: 404 });
    await prisma.warehouse.update({ where: { id: warehouseId }, data: { [FIELD_BY_KIND[kind]]: startWeek } });
    return NextResponse.json({ startWeek });
  }

  if (!startWeek) return NextResponse.json({ message: "Cần chọn tuần khởi đầu" }, { status: 400 });
  const key = ROTATION_START_WEEK_KEY_BY_KIND[kind];
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value: startWeek },
    create: {
      key,
      value: startWeek,
      description:
        kind === "RA_RE"
          ? "Tuần khởi đầu (ISO 8601) của Nhóm tuần ra rễ 1 — các Nhóm 2/3/4 tự tính tuần tiếp theo, xoay vòng liên tục qua các năm"
          : "Tuần khởi đầu (ISO 8601) của Nhóm tuần mẫu mẹ 1 — các Nhóm tiếp theo tự tính tuần kế tiếp, xoay vòng liên tục qua các năm",
    },
  });

  return NextResponse.json({ startWeek });
}
