import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { getCalendarWeekNumber } from "@/lib/week-rotation";
import { computeMotherPhotoGroups, findMotherPhotoGroup } from "@/lib/mother-photo-grouping";

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

  // Gộp giống hệt /api/mother-photo-update/due (xem src/lib/mother-photo-grouping.ts) — "kiểu ảnh đã
  // chụp" tra theo CẢ NHÓM (không chỉ riêng lô/giàn đang xem), để chụp ở 1 giàn trong nhóm thì giàn khác
  // cùng nhóm tìm thủ công ở đây cũng tự khoá đúng nút tương ứng, không cho chụp trùng.
  const groups = await computeMotherPhotoGroups();
  const allGroupShelfIds = Array.from(new Set(Array.from(groups.values()).flatMap((g) => Array.from(g.shelfIds))));
  const allPhotos = await prisma.motherPhoto.findMany({
    where: { shelfId: { in: allGroupShelfIds } },
    select: { plantTypeId: true, shelfId: true, weekIndex: true, mediumRole: true },
  });

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
        plantTypes: Array.from(byPlantType.values()).map((lot) => {
          // Giàn không thuộc nhóm nào (hiếm — chưa gán Nhóm xoay vòng và không trùng tuần nhập kho sáng
          // với giàn nào khác) thì tự nó là "nhóm" chỉ có đúng lô này, tra cứu ảnh trực tiếp theo shelfId.
          const group = findMotherPhotoGroup(groups, s.id, lot.plantType.id);
          const relevantShelfIds = group ? group.shelfIds : new Set([s.id]);
          const relevant = allPhotos.filter((p) => p.plantTypeId === lot.plantType.id && relevantShelfIds.has(p.shelfId));
          return {
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
            capturedWeekIndexesMother: Array.from(new Set(relevant.filter((p) => p.mediumRole !== "PRE_ROOTING").map((p) => p.weekIndex))),
            capturedWeekIndexesPreRooting: Array.from(new Set(relevant.filter((p) => p.mediumRole === "PRE_ROOTING").map((p) => p.weekIndex))),
          };
        }),
      };
    });

  return NextResponse.json({ shelves: items });
}
