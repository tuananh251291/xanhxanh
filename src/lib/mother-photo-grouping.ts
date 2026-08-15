import { prisma } from "@/lib/prisma";
import { getCalendarWeekNumber } from "@/lib/week-rotation";

export type MotherPhotoGroup = {
  key: string;
  plantTypeId: string;
  plantTypeCode: string;
  plantTypeName: string;
  transferWaitWeeks: number;
  motherMediumCode: string | null;
  motherMediumName: string | null;
  preRootingMediumCode: string | null;
  preRootingMediumName: string | null;
  shelfIds: Set<string>;
  shelfCodes: string[];
  representativeLotId: string;
  representativeShelfId: string;
  representativeQuantity: number;
  enteredWeek: number;
  enteredAt: Date;
};

// Gộp các lô mẫu mẹ ACTIVE trên giàn đã gắn nhân sự thành nhóm theo (mã cây + KHỚP ít nhất 1 trong 2 tín
// hiệu: cùng Nhóm tuần mẫu mẹ HOẶC cùng tuần nhập kho sáng), bắc cầu qua Union-Find — DÙNG CHUNG cho danh
// sách "cần chụp" (/api/mother-photo-update/due) và tra cứu "kiểu ảnh đã chụp" khi tìm giàn thủ công
// (/api/mother-photo-update/shelves), để 2 đường LUÔN nhất quán: chụp ở 1 giàn trong nhóm thì mọi giàn
// khác cùng nhóm cũng phải coi là đã chụp tuần đó, dù NV vào qua danh sách "cần chụp" hay tự gõ tìm giàn
// khác trong cùng nhóm.
export async function computeMotherPhotoGroups(): Promise<Map<string, MotherPhotoGroup>> {
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
      enteredAt: true,
      shelf: { select: { id: true, code: true, name: true, rotationGroupId: true } },
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
  });

  type LotInfo = Omit<(typeof lots)[number], "shelf"> & { shelf: NonNullable<(typeof lots)[number]["shelf"]>; enteredWeek: number };
  const lotsWithShelf: LotInfo[] = lots
    .filter((l) => l.shelf !== null)
    .map((l) => ({ ...l, shelf: l.shelf!, enteredWeek: getCalendarWeekNumber(l.enteredAt) }));

  // Union-Find trong phạm vi từng mã cây — gộp 2 lô khi cùng rotationGroupId (khác null) HOẶC cùng
  // enteredWeek.
  const byPlantType = new Map<string, LotInfo[]>();
  for (const lot of lotsWithShelf) {
    const arr = byPlantType.get(lot.plantType.id) ?? [];
    arr.push(lot);
    byPlantType.set(lot.plantType.id, arr);
  }

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const group of byPlantType.values()) {
    for (const lot of group) parent.set(lot.id, lot.id);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const sameRotationGroup = a.shelf.rotationGroupId !== null && a.shelf.rotationGroupId === b.shelf.rotationGroupId;
        const sameEnteredWeek = a.enteredWeek === b.enteredWeek;
        if (sameRotationGroup || sameEnteredWeek) union(a.id, b.id);
      }
    }
  }

  const groups = new Map<string, MotherPhotoGroup>();
  for (const lot of lotsWithShelf) {
    const groupKey = find(lot.id);
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
        preRootingMediumCode: lot.instruction?.items[0]?.preRootingMotherMedium?.code ?? null,
        preRootingMediumName: lot.instruction?.items[0]?.preRootingMotherMedium?.name ?? null,
        shelfIds: new Set([lot.shelf.id]),
        shelfCodes: [lot.shelf.code],
        representativeLotId: lot.id,
        representativeShelfId: lot.shelf.id,
        representativeQuantity: lot.quantity,
        enteredWeek: lot.enteredWeek,
        enteredAt: lot.enteredAt,
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
        existing.enteredWeek = lot.enteredWeek;
        existing.enteredAt = lot.enteredAt;
      }
    }
  }

  return groups;
}

// Tìm nhóm chứa đúng (shelfId, plantTypeId) — cần cả 2 điều kiện vì 1 giàn lý thuyết có thể có nhiều mã
// cây khác nhau (mỗi mã cây thuộc 1 nhóm riêng, xem computeMotherPhotoGroups gộp theo từng mã cây).
export function findMotherPhotoGroup(
  groups: Map<string, MotherPhotoGroup>,
  shelfId: string,
  plantTypeId: string
): MotherPhotoGroup | undefined {
  for (const g of groups.values()) {
    if (g.plantTypeId === plantTypeId && g.shelfIds.has(shelfId)) return g;
  }
  return undefined;
}
