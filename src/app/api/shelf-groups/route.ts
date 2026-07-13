import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

// Nhóm giàn kệ (gộp các kệ lẻ lại, không cần cùng block) — chỉ Admin cấp cao (SUPER_ADMIN) mới xem/cài đặt được, theo đúng
// yêu cầu nghiệp vụ (khác ADMIN thường, xem isAdminRole trong types/index.ts vốn coi 2 vai trò này
// ngang quyền ở hầu hết nơi khác — Nhóm giàn kệ là ngoại lệ).
// rotationKind/rotationOrder biến 1 Nhóm thành 1 "khe" trong cơ chế xoay vòng Nhóm tuần ra rễ/Nhóm tuần
// mẫu mẹ (xem Shelf.rotationGroupId, src/lib/rooting-week-group.ts) — không bắt buộc, để trống thì Nhóm
// chỉ dùng cho mục đích gộp kệ tự do (groupId) như trước.
const createSchema = z.object({
  name: z.string().min(1, "Cần nhập tên nhóm"),
  type: z.string().trim().optional(),
  rotationKind: z.enum(["RA_RE", "MAU_ME"]).nullable().optional(),
  rotationOrder: z.number().int().positive().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const groups = await prisma.shelfGroup.findMany({
    include: {
      shelves: {
        select: {
          id: true,
          code: true,
          block: true,
          warehouse: { select: { id: true, name: true } },
          room: { select: { id: true, name: true } },
        },
        orderBy: { code: "asc" },
      },
      rotationShelves: {
        select: {
          id: true,
          code: true,
          block: true,
          warehouse: { select: { id: true, name: true } },
          room: { select: { id: true, name: true } },
        },
        orderBy: { code: "asc" },
      },
    },
    orderBy: [{ rotationKind: "asc" }, { rotationOrder: "asc" }, { createdAt: "asc" }],
  });

  const result = groups.map((g) => {
    // Nhóm xoay vòng (rotationKind khác null) hiển thị thành viên qua rotationGroupId — Nhóm gộp tự do
    // thông thường vẫn hiển thị qua groupId như trước.
    const memberShelves = g.rotationKind ? g.rotationShelves : g.shelves;
    const byRoom = new Map<string, { roomId: string; roomName: string; warehouseId: string; warehouseName: string; shelves: { id: string; code: string; block: string | null }[] }>();
    for (const s of memberShelves) {
      if (!s.room) continue;
      const entry = byRoom.get(s.room.id) ?? {
        roomId: s.room.id,
        roomName: s.room.name,
        warehouseId: s.warehouse.id,
        warehouseName: s.warehouse.name,
        shelves: [],
      };
      entry.shelves.push({ id: s.id, code: s.code, block: s.block });
      byRoom.set(s.room.id, entry);
    }
    return {
      id: g.id,
      name: g.name,
      type: g.type,
      rotationKind: g.rotationKind,
      rotationOrder: g.rotationOrder,
      shelfCount: memberShelves.length,
      rooms: Array.from(byRoom.values()),
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { name, type, rotationKind, rotationOrder } = parsed.data;
  if (rotationKind && !rotationOrder) {
    return NextResponse.json({ message: "Nhóm xoay vòng cần nhập thứ tự khe (rotationOrder)" }, { status: 400 });
  }

  const group = await prisma.shelfGroup.create({
    data: { name, type: type || null, rotationKind: rotationKind ?? null, rotationOrder: rotationKind ? rotationOrder : null },
  });
  return NextResponse.json(group, { status: 201 });
}
