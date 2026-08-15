import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { getCalendarWeekNumber } from "@/lib/week-rotation";

// Tìm giàn kệ Phòng mẫu mẹ theo mã/tên cho trang "Cập nhật hình ảnh định kì" (ô tìm bổ sung cạnh danh
// sách "Cần chụp tuần này", xem /api/mother-photo-update/due) — KHÔNG giới hạn theo 1 kho (khác
// /api/mother-stock-reshelf vốn khoá theo workplaceWarehouseId của KHO_MO), vì NV Kỹ thuật làm việc ở
// mọi kho sản xuất. CHỈ trả về giàn ĐÃ GẮN cho nhân sự (assignedStaffId khác null) — nghĩa vụ chụp ảnh
// định kì không áp dụng cho "kệ chung".
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
      assignedStaffId: { not: null },
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
          enteredAt: true,
          plantType: { select: { id: true, code: true, name: true, transferWaitWeeks: true } },
          instruction: {
            select: {
              items: {
                where: { stageCode: "M05" },
                take: 1,
                select: {
                  motherMedium: { select: { code: true, name: true } },
                  preRootingMotherMedium: { select: { code: true, name: true } },
                },
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

  const representativeLotIds = shelves.flatMap((s) => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const lot of s.lots) {
      if (!seen.has(lot.plantType.id)) {
        seen.add(lot.plantType.id);
        ids.push(lot.id);
      }
    }
    return ids;
  });
  // "Kiểu ảnh" nào của lô này đã có ảnh RỒI (mọi thời điểm, tách riêng theo vai trò môi trường nếu chỉ
  // định có 2 môi trường) — mỗi kiểu ảnh chỉ ứng đúng 1 tuần lịch cụ thể của lô, không lặp lại, nên chụp
  // 1 lần là xong vĩnh viễn cho tuần đó, dùng để mờ nút tương ứng.
  const existingPhotos = await prisma.motherPhoto.findMany({
    where: { lotId: { in: representativeLotIds } },
    select: { lotId: true, weekIndex: true, mediumRole: true },
  });
  const capturedMotherByLotId = new Map<string, number[]>();
  const capturedPreRootingByLotId = new Map<string, number[]>();
  for (const p of existingPhotos) {
    const map = p.mediumRole === "PRE_ROOTING" ? capturedPreRootingByLotId : capturedMotherByLotId;
    const arr = map.get(p.lotId) ?? [];
    arr.push(p.weekIndex);
    map.set(p.lotId, arr);
  }

  const items = shelves
    .filter((s) => s.lots.length > 0)
    .map((s) => {
      // 1 giàn đã chia vẫn có thể có nhiều lô cùng 1 mã cây (nhiều đợt cấy khác nhau) — chỉ lấy lô số
      // lượng lớn nhất làm đại diện để chụp ảnh (đã orderBy quantity desc nên phần tử đầu mỗi mã cây
      // chính là lô đó).
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
          // Tuần nhập lên kho sáng (cùng cách tính số tuần trong mã lô, xem getCalendarWeekNumber) —
          // cập nhật ảnh cần làm ở các tuần enteredWeek+1 .. enteredWeek+(transferWaitWeeks-1).
          enteredWeek: getCalendarWeekNumber(lot.enteredAt),
          enteredAt: lot.enteredAt,
          motherMediumCode: lot.instruction?.items[0]?.motherMedium?.code ?? null,
          motherMediumName: lot.instruction?.items[0]?.motherMedium?.name ?? null,
          preRootingMediumCode: lot.instruction?.items[0]?.preRootingMotherMedium?.code ?? null,
          preRootingMediumName: lot.instruction?.items[0]?.preRootingMotherMedium?.name ?? null,
          capturedWeekIndexesMother: capturedMotherByLotId.get(lot.id) ?? [],
          capturedWeekIndexesPreRooting: capturedPreRootingByLotId.get(lot.id) ?? [],
        })),
      };
    });

  return NextResponse.json({ shelves: items });
}
