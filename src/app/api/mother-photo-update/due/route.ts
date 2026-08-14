import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { startOfWeek } from "date-fns";
import { toStoredWeekStart, getCalendarWeekNumber } from "@/lib/week-rotation";
import type { MotherPhotoMediumRole } from "@prisma/client";

// Danh sách giàn kệ "cần chụp ảnh" tuần này — CHỈ tính giàn ĐÃ GẮN cho nhân sự (assignedStaffId khác
// null), bỏ qua hẳn "kệ chung" (không thuộc nghĩa vụ chụp ảnh định kì). Dùng CHUNG cho mọi NV Kỹ thuật
// (giống "Mẫu mẹ đạt chưa chỉ định") — ai chụp trước thì biến mất khỏi danh sách của TẤT CẢ mọi người,
// không lọc theo takenById (khác bảng "Lịch sử hoàn thành" ở /api/mother-photo-update/weekly-status vẫn
// tính riêng từng NV).
//
// 1 "thẻ cần chụp" gộp các giàn CÙNG mã cây mà KHỚP ít nhất 1 trong 2 tín hiệu: cùng Nhóm tuần mẫu mẹ
// (rotationGroupId, do Admin gán) HOẶC cùng tuần nhập kho sáng (enteredWeek, tính thẳng từ dữ liệu thật —
// không phụ thuộc Admin đã cấu hình Nhóm đủ/đúng chưa). Bắc cầu qua Union-Find: A-B gộp qua Nhóm, B-C gộp
// qua tuần nhập thì A-C cũng thuộc 1 nhóm dù không khớp trực tiếp — cùng 1 "gia đình lô" hợp lý vì đều bắt
// nguồn từ cùng 1 đợt cấy. Chụp đại diện 1 giàn trong nhóm là đủ, giàn còn lại tự biến mất theo.
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
      enteredAt: true,
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

  type Group = {
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
  };

  const groups = new Map<string, Group>();
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
      }
    }
  }

  // Tất cả ảnh (mọi thời điểm, không chỉ tuần này) của các giàn liên quan — dùng để: (1) loại bỏ nhóm đã
  // chụp ĐỦ TUẦN NÀY (bất kể ai chụp, chụp ở đúng giàn nào trong nhóm — nếu chỉ định có 2 môi trường thì
  // phải đủ cả 2 vai trò mới coi là xong, không được 1 nút clear cả thẻ khiến vai trò còn lại không ai
  // chụp nữa), (2) biết "kiểu ảnh" nào (theo từng vai trò môi trường) đã chụp RỒI (mọi tuần, vì mỗi kiểu
  // ảnh chỉ ứng đúng 1 tuần lịch cụ thể của lô, không lặp lại) để nút tuần đó tự mờ đi ở client.
  const allShelfIds = Array.from(new Set(lotsWithShelf.map((l) => l.shelf.id)));
  const allPhotos = await prisma.motherPhoto.findMany({
    where: { shelfId: { in: allShelfIds } },
    select: { plantTypeId: true, shelfId: true, weekIndex: true, weekStart: true, mediumRole: true },
  });
  const photosThisWeek = allPhotos.filter((p) => p.weekStart.getTime() === weekStart.getTime());

  const due = Array.from(groups.values()).filter((g) => {
    const requiredRoles: (MotherPhotoMediumRole | null)[] = g.preRootingMediumCode ? ["MOTHER", "PRE_ROOTING"] : [null];
    const coveredRoles = new Set(
      photosThisWeek
        .filter((p) => p.plantTypeId === g.plantTypeId && g.shelfIds.has(p.shelfId))
        .map((p) => p.mediumRole)
    );
    return !requiredRoles.every((role) => coveredRoles.has(role));
  });

  return NextResponse.json({
    due: due
      .map(({ shelfIds, representativeQuantity: _q, ...rest }) => {
        const relevant = allPhotos.filter((p) => p.plantTypeId === rest.plantTypeId && shelfIds.has(p.shelfId));
        return {
          ...rest,
          capturedWeekIndexesMother: Array.from(new Set(relevant.filter((p) => p.mediumRole !== "PRE_ROOTING").map((p) => p.weekIndex))),
          capturedWeekIndexesPreRooting: Array.from(new Set(relevant.filter((p) => p.mediumRole === "PRE_ROOTING").map((p) => p.weekIndex))),
        };
      })
      .sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode)),
  });
}
