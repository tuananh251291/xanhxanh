import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { startOfWeek } from "date-fns";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { computeMotherPhotoGroups } from "@/lib/mother-photo-grouping";
import type { MotherPhotoMediumRole } from "@prisma/client";

// Danh sách giàn kệ "cần chụp ảnh" tuần này — CHỈ tính giàn ĐÃ GẮN cho nhân sự (assignedStaffId khác
// null), bỏ qua hẳn "kệ chung" (không thuộc nghĩa vụ chụp ảnh định kì). Dùng CHUNG cho mọi NV Kỹ thuật
// (giống "Mẫu mẹ đạt chưa chỉ định") — ai chụp trước thì biến mất khỏi danh sách của TẤT CẢ mọi người,
// không lọc theo takenById (khác bảng "Lịch sử hoàn thành" ở /api/mother-photo-update/weekly-status vẫn
// tính riêng từng NV).
//
// 1 "thẻ cần chụp" gộp các giàn theo computeMotherPhotoGroups (xem src/lib/mother-photo-grouping.ts) —
// dùng CHUNG logic gộp với /api/mother-photo-update/shelves để nhất quán: chụp ở 1 giàn trong nhóm thì
// giàn khác cùng nhóm cũng biến mất khỏi "cần chụp" VÀ tự khoá nút tương ứng khi tìm thủ công.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KY_THUAT") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const groups = await computeMotherPhotoGroups();

  // Tất cả ảnh (mọi thời điểm, không chỉ tuần này) của các giàn liên quan — dùng để: (1) loại bỏ nhóm đã
  // chụp ĐỦ TUẦN NÀY (bất kể ai chụp, chụp ở đúng giàn nào trong nhóm — nếu chỉ định có 2 môi trường thì
  // phải đủ cả 2 vai trò mới coi là xong, không được 1 nút clear cả thẻ khiến vai trò còn lại không ai
  // chụp nữa), (2) biết "kiểu ảnh" nào (theo từng vai trò môi trường) đã chụp RỒI (mọi tuần, vì mỗi kiểu
  // ảnh chỉ ứng đúng 1 tuần lịch cụ thể của lô, không lặp lại) để nút tuần đó tự mờ đi ở client.
  const allShelfIds = Array.from(new Set(Array.from(groups.values()).flatMap((g) => Array.from(g.shelfIds))));
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
