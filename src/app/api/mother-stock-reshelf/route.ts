import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sumLotQuantity } from "@/types";
import { ShelfAssignError } from "@/lib/shelf-assignment";
import { moveMotherStock } from "@/lib/mother-stock-reshelf";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ shelves: [] });

  const shelves = await prisma.shelf.findMany({
    where: { warehouseId: workplaceWarehouseId, isActive: true, room: { type: "PHONG_MAU_ME" } },
    select: {
      code: true,
      name: true,
      capacity: true,
      plantType: { select: { code: true, name: true } },
      assignedStaff: { select: { name: true } },
      allowedCodes: true,
      // Nhóm tuần mẫu mẹ giàn đang thuộc — quyết định lịch "đạt hạn cấy chuyển" (xem
      // summarizeMotherWeekGroups), hiển thị để NV biết chuyển vào giàn nào thì theo lịch Nhóm nào; null
      // = giàn chưa gán Nhóm (Kho mẫu mẹ chung hoặc giàn đã chia nhưng chưa gán) — không có hạn.
      rotationGroup: { select: { name: true, rotationOrder: true } },
      lots: {
        where: { status: "ACTIVE" },
        select: {
          code: true,
          quantity: true,
          stageCode: true,
          plantType: { select: { code: true, name: true } },
          // Lô đã "có chủ" (nguồn của 1 chỉ định cấy ACTIVE/DRAFT nhưng chưa bàn giao) — chưa sắp xếp
          // được, xem comment ở moveMotherStock (src/lib/mother-stock-reshelf.ts). Hiện sẵn ở đây để Kho
          // mô biết trước khi thử chuyển, không cần đợi bấm mới thấy lỗi.
          instructionItems: {
            where: { instruction: { status: { in: ["ACTIVE", "DRAFT"] }, handedOverAt: null } },
            select: { instruction: { select: { code: true } } },
          },
        },
        orderBy: { enteredAt: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });

  return NextResponse.json({
    shelves: shelves.map((s) => ({
      code: s.code,
      name: s.name,
      capacity: s.capacity,
      used: sumLotQuantity(s.lots),
      plantTypeCode: s.plantType?.code ?? null,
      plantTypeName: s.plantType?.name ?? null,
      assignedStaffName: s.assignedStaff?.name ?? null,
      allowedCodes: s.allowedCodes,
      rotationGroupName: s.rotationGroup?.name ?? null,
      lots: s.lots.map((l) => ({
        code: l.code,
        quantity: l.quantity,
        stageCode: l.stageCode,
        plantTypeCode: l.plantType.code,
        plantTypeName: l.plantType.name,
        lockedByInstructionCode: l.instructionItems[0]?.instruction.code ?? null,
      })),
    })),
  });
}

const moveSchema = z.object({
  fromShelfCode: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  toShelfCode: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const body = await req.json();
  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  try {
    const result = await moveMotherStock({ ...parsed.data, workplaceWarehouseId });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof ShelfAssignError) return NextResponse.json({ message: e.message }, { status: 409 });
    throw e;
  }
}
