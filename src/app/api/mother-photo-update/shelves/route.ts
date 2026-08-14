import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";

// Tìm giàn kệ Phòng mẫu mẹ theo mã/tên cho trang "Cập nhật hình ảnh định kì" — KHÔNG giới hạn theo 1
// kho (khác /api/mother-stock-reshelf vốn khoá theo workplaceWarehouseId của KHO_MO), vì NV Kỹ thuật
// làm việc ở mọi kho sản xuất (xem comment User.workplaceWarehouseId trong schema.prisma).
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KY_THUAT" && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ shelves: [] });

  const shelves = await prisma.shelf.findMany({
    where: {
      isActive: true,
      room: { type: "PHONG_MAU_ME" },
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
      rotationGroup: { select: { rotationOrder: true } },
      lots: {
        where: { status: "ACTIVE", stageCode: "M05", quantity: { gt: 0 } },
        select: {
          id: true,
          quantity: true,
          plantType: { select: { id: true, code: true, name: true, transferWaitWeeks: true } },
          instruction: {
            select: {
              items: {
                where: { stageCode: "M05" },
                take: 1,
                select: { motherMedium: { select: { code: true, name: true } } },
              },
            },
          },
        },
        orderBy: { quantity: "desc" },
      },
    },
    orderBy: { code: "asc" },
    take: 20,
  });

  const items = shelves
    .filter((s) => s.lots.length > 0)
    .map((s) => {
      // 1 giàn có thể có nhiều lô cùng 1 mã cây (giàn chung) — chỉ lấy lô số lượng lớn nhất làm đại
      // diện để chụp ảnh (đã orderBy quantity desc ở trên nên phần tử đầu tiên mỗi mã cây là lô đó).
      const byPlantType = new Map<string, (typeof s.lots)[number]>();
      for (const lot of s.lots) {
        if (!byPlantType.has(lot.plantType.id)) byPlantType.set(lot.plantType.id, lot);
      }
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        rotationOrder: s.rotationGroup?.rotationOrder ?? null,
        plantTypes: Array.from(byPlantType.values()).map((lot) => ({
          plantTypeId: lot.plantType.id,
          plantTypeCode: lot.plantType.code,
          plantTypeName: lot.plantType.name,
          transferWaitWeeks: lot.plantType.transferWaitWeeks,
          lotId: lot.id,
          motherMediumCode: lot.instruction?.items[0]?.motherMedium?.code ?? null,
          motherMediumName: lot.instruction?.items[0]?.motherMedium?.name ?? null,
        })),
      };
    });

  return NextResponse.json({ shelves: items });
}
