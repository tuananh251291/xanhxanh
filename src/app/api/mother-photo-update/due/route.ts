import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { startOfWeek } from "date-fns";
import { toStoredWeekStart, getCalendarWeekNumber } from "@/lib/week-rotation";

// Danh sách giàn kệ "cần chụp ảnh" tuần này — CHỈ tính giàn ĐÃ GẮN cho nhân sự (assignedStaffId khác
// null), bỏ qua hẳn "kệ chung" (không thuộc nghĩa vụ chụp ảnh định kì). Dùng CHUNG cho mọi NV Kỹ thuật
// (giống "Mẫu mẹ đạt chưa chỉ định") — ai chụp trước thì biến mất khỏi danh sách của TẤT CẢ mọi người,
// không lọc theo takenById (khác bảng "Lịch sử hoàn thành" ở /api/mother-photo-update/weekly-status vẫn
// tính riêng từng NV).
//
// 1 "thẻ cần chụp" gộp theo (Nhóm tuần mẫu mẹ, loại cây) — nếu 1 mã cây trải trên nhiều giàn CÙNG 1 Nhóm
// xoay vòng (do 1 giàn không đủ chỗ), chụp đại diện 1 giàn trong nhóm là đủ, giàn còn lại tự biến mất
// theo (không tách riêng theo shelfId khi đã cùng rotationGroupId). Giàn chưa gán Nhóm xoay vòng nào thì
// không gộp được với giàn khác — mỗi giàn như vậy là 1 thẻ riêng.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KY_THUAT") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const lots = await prisma.lot.findMany({
    where: {
      stage: "MAU_ME",
      status: "ACTIVE",
      quantity: { gt: 0 },
      shelf: { assignedStaffId: { not: null } },
    },
    select: {
      id: true,
      quantity: true,
      shelf: {
        select: {
          id: true,
          code: true,
          name: true,
          rotationGroupId: true,
        },
      },
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
  });

  type Group = {
    key: string;
    plantTypeId: string;
    plantTypeCode: string;
    plantTypeName: string;
    transferWaitWeeks: number;
    motherMediumCode: string | null;
    motherMediumName: string | null;
    shelfIds: Set<string>;
    shelfCodes: string[];
    representativeLotId: string;
    representativeShelfId: string;
    representativeQuantity: number;
    enteredWeek: number;
  };

  const groups = new Map<string, Group>();
  for (const lot of lots) {
    if (!lot.shelf) continue;
    const groupKey = lot.shelf.rotationGroupId
      ? `rg:${lot.shelf.rotationGroupId}:${lot.plantType.id}`
      : `shelf:${lot.shelf.id}:${lot.plantType.id}`;
    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        key: groupKey,
        plantTypeId: lot.plantType.id,
        plantTypeCode: lot.plantType.code,
        plantTypeName: lot.plantType.name,
        transferWaitWeeks: lot.plantType.transferWaitWeeks,
        motherMediumCode: lot.instruction?.items[0]?.motherMedium?.code ?? null,
        motherMediumName: lot.instruction?.items[0]?.motherMedium?.name ?? null,
        shelfIds: new Set([lot.shelf.id]),
        shelfCodes: [lot.shelf.code],
        representativeLotId: lot.id,
        representativeShelfId: lot.shelf.id,
        representativeQuantity: lot.quantity,
        enteredWeek: 0, // set below via separate enteredAt fetch
      });
    } else {
      if (!existing.shelfIds.has(lot.shelf.id)) {
        existing.shelfIds.add(lot.shelf.id);
        existing.shelfCodes.push(lot.shelf.code);
      }
      // Lô số lượng lớn nhất trong nhóm làm đại diện (giàn/tuần nhập gắn với lô đó).
      if (lot.quantity > existing.representativeQuantity) {
        existing.representativeLotId = lot.id;
        existing.representativeShelfId = lot.shelf.id;
        existing.representativeQuantity = lot.quantity;
      }
    }
  }

  // Lấy enteredAt của các lô đại diện để tính "Tuần nhập kho sáng" — truy vấn riêng vì không select sẵn
  // ở trên (tránh chọn dư field cho những lô không phải đại diện).
  const representativeLotIds = Array.from(groups.values()).map((g) => g.representativeLotId);
  const representativeLots = await prisma.lot.findMany({
    where: { id: { in: representativeLotIds } },
    select: { id: true, enteredAt: true },
  });
  const enteredAtByLotId = new Map(representativeLots.map((l) => [l.id, l.enteredAt]));
  for (const g of groups.values()) {
    const enteredAt = enteredAtByLotId.get(g.representativeLotId);
    if (enteredAt) g.enteredWeek = getCalendarWeekNumber(enteredAt);
  }

  // Loại bỏ nhóm đã có ít nhất 1 ảnh tuần này (bất kể ai chụp, chụp ở đúng giàn nào trong nhóm).
  const allShelfIds = Array.from(new Set(lots.filter((l) => l.shelf).map((l) => l.shelf!.id)));
  const photosThisWeek = await prisma.motherPhoto.findMany({
    where: { weekStart, shelfId: { in: allShelfIds } },
    select: { plantTypeId: true, shelfId: true },
  });
  const covered = new Set(photosThisWeek.map((p) => `${p.plantTypeId}::${p.shelfId}`));

  const due = Array.from(groups.values()).filter((g) => {
    for (const shelfId of g.shelfIds) {
      if (covered.has(`${g.plantTypeId}::${shelfId}`)) return false;
    }
    return true;
  });

  return NextResponse.json({
    due: due
      .map(({ shelfIds: _shelfIds, representativeQuantity: _q, ...rest }) => rest)
      .sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode)),
  });
}
