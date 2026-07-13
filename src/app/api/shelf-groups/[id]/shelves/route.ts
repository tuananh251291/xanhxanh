import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  shelfIds: z.array(z.string()).min(1, "Cần chọn ít nhất 1 kệ"),
  action: z.enum(["assign", "unassign"]),
});

const ROOM_TYPE_BY_ROTATION_KIND = { RA_RE: "PHONG_RA_RE", MAU_ME: "PHONG_MAU_ME" } as const;

// Gán/gỡ 1 hoặc nhiều kệ lẻ vào/khỏi Nhóm — theo từng kệ, không còn ràng buộc phải cùng 1 block
// (VD có thể gộp A1C10 và B1C09 vào cùng 1 Nhóm dù khác block). Gán đè: nếu kệ đang thuộc Nhóm khác,
// gán vào Nhóm này sẽ chuyển hẳn sang (1 kệ chỉ thuộc 1 Nhóm tại 1 thời điểm).
// Nhóm xoay vòng (rotationKind khác null) ghi vào rotationGroupId thay vì groupId — TÁCH BIỆT với Nhóm
// gộp tự do, xem Shelf.rotationGroupId — và chỉ nhận đúng loại kệ (RA_RE → Phòng ra rễ, MAU_ME → Phòng
// mẫu mẹ) để không phá vỡ ý nghĩa nghiệp vụ của cơ chế xoay vòng.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { shelfIds, action } = parsed.data;

  const group = await prisma.shelfGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ message: "Không tìm thấy Nhóm" }, { status: 404 });

  const field = group.rotationKind ? "rotationGroupId" : "groupId";

  if (action === "assign") {
    if (group.rotationKind) {
      const requiredRoomType = ROOM_TYPE_BY_ROTATION_KIND[group.rotationKind];
      const mismatched = await prisma.shelf.count({
        where: { id: { in: shelfIds }, room: { type: { not: requiredRoomType } } },
      });
      if (mismatched > 0) {
        return NextResponse.json(
          { message: `Nhóm này chỉ nhận kệ thuộc ${requiredRoomType === "PHONG_RA_RE" ? "Phòng ra rễ" : "Phòng mẫu mẹ"}` },
          { status: 400 }
        );
      }
      // Nhóm tuần mẫu mẹ: số khe (rotationOrder) không được vượt quá "Thời gian đợi cấy chuyển"
      // (transferWaitWeeks) của mã cây gắn trên kệ — quá số tuần đó thì kệ không bao giờ xoay tới khe này
      // được (VD cây 4 tuần chỉ dùng khe 1-4, không thể vào khe 5/6).
      if (group.rotationKind === "MAU_ME") {
        const shelvesToCheck = await prisma.shelf.findMany({
          where: { id: { in: shelfIds } },
          select: { code: true, plantType: { select: { code: true, transferWaitWeeks: true } } },
        });
        const noPlantType = shelvesToCheck.filter((s) => !s.plantType);
        if (noPlantType.length > 0) {
          return NextResponse.json(
            { message: `Kệ ${noPlantType.map((s) => s.code).join(", ")} chưa gán mã cây — cần gán mã cây trước khi xếp vào Nhóm tuần mẫu mẹ` },
            { status: 400 }
          );
        }
        const exceeded = shelvesToCheck.filter((s) => group.rotationOrder! > s.plantType!.transferWaitWeeks);
        if (exceeded.length > 0) {
          return NextResponse.json(
            {
              message: `Nhóm khe ${group.rotationOrder} vượt quá "Thời gian đợi cấy chuyển" của mã cây trên kệ ${exceeded
                .map((s) => `${s.code} (${s.plantType!.code}: ${s.plantType!.transferWaitWeeks} tuần)`)
                .join(", ")}`,
            },
            { status: 400 }
          );
        }
      }
    }
    await prisma.shelf.updateMany({
      where: { id: { in: shelfIds } },
      data: { [field]: id },
    });
  } else {
    await prisma.shelf.updateMany({
      where: { id: { in: shelfIds }, [field]: id },
      data: { [field]: null },
    });
  }

  return NextResponse.json({ success: true });
}
