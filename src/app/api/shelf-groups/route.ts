import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

// Nhóm giàn kệ (gộp các kệ lẻ lại, không cần cùng block) — chỉ Admin cấp cao (SUPER_ADMIN) mới xem/cài đặt được, theo đúng
// yêu cầu nghiệp vụ (khác ADMIN thường, xem isAdminRole trong types/index.ts vốn coi 2 vai trò này
// ngang quyền ở hầu hết nơi khác — Nhóm giàn kệ là ngoại lệ).
const createSchema = z.object({
  name: z.string().min(1, "Cần nhập tên nhóm"),
  type: z.string().trim().optional(),
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
    },
    orderBy: { createdAt: "asc" },
  });

  const result = groups.map((g) => {
    const byRoom = new Map<string, { roomId: string; roomName: string; warehouseId: string; warehouseName: string; shelves: { id: string; code: string; block: string | null }[] }>();
    for (const s of g.shelves) {
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
      shelfCount: g.shelves.length,
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

  const group = await prisma.shelfGroup.create({ data: { name: parsed.data.name, type: parsed.data.type || null } });
  return NextResponse.json(group, { status: 201 });
}
