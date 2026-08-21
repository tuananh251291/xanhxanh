import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateDailyTaskCode } from "@/lib/codes";
import { isAdminRole, isKhoThanhPhamRole } from "@/types";
import { z } from "zod";

const createSchema = z
  .object({
    type: z.enum(["KIEM_TRA_CAY", "DE_XUAT_TRONG_HUY"]),
    plantTypeIds: z.array(z.string().min(1)).optional(),
    roomId: z.string().min(1).nullable().optional(),
    assignedToId: z.string().min(1),
    notes: z.string().optional(),
  })
  .refine((d) => (d.plantTypeIds && d.plantTypeIds.length > 0) || !!d.roomId, {
    message: "Cần chọn ít nhất 1 Loại cây hoặc 1 Phòng cần kiểm tra",
  });

// Tạo 1 hoặc nhiều "Nhiệm vụ ngày" (Kiểm tra cây / Đề xuất trồng-hủy) — chỉ Quản lý kho thành phẩm/Admin.
// Nhiều plantTypeIds → tạo nhiều DailyTask (1 dòng/loại cây), cùng assignedToId — xem
// prisma/schema.prisma model DailyTask.
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "QUAN_LY_KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ Quản lý kho thành phẩm mới tạo được nhiệm vụ ngày" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { type, plantTypeIds, roomId, assignedToId, notes } = parsed.data;

  const staff = await prisma.user.findUnique({ where: { id: assignedToId }, select: { role: true } });
  if (!staff || !isKhoThanhPhamRole(staff.role)) {
    return NextResponse.json({ message: "Chỉ gán được cho NV/Quản lý kho thành phẩm" }, { status: 400 });
  }

  const targets = plantTypeIds && plantTypeIds.length > 0 ? plantTypeIds.map((id) => ({ plantTypeId: id as string | null, roomId: null as string | null })) : [{ plantTypeId: null, roomId: roomId ?? null }];

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const t of targets) {
      const code = await generateDailyTaskCode(tx);
      rows.push(
        await tx.dailyTask.create({
          data: {
            code,
            type,
            plantTypeId: t.plantTypeId,
            roomId: t.roomId,
            notes: notes || null,
            assignedToId,
            assignedById: session!.user!.id,
          },
        })
      );
    }
    return rows;
  });

  return NextResponse.json(created);
}
