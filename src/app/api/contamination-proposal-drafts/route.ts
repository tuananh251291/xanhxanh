import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateContaminationProposalCode } from "@/lib/codes";
import { z } from "zod";
import type { ContaminationBalanceCategory } from "@prisma/client";

// "Phiếu chung" — các dòng đã "Gộp phiếu" (status DRAFT) nhưng chưa "Gửi đề xuất trồng/hủy" cho Admin,
// gộp từ nhiều NV cấy mô/nhiều ngày của đúng 1 kho sản xuất (xem POST bên dưới và
// POST /api/contamination-proposal-drafts/submit).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json([]);

  const lines = await prisma.contaminationProposal.findMany({
    where: { warehouseId, status: "DRAFT" },
    include: { plantType: { select: { code: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (lines.length === 0) return NextResponse.json([]);

  const staffIds = [...new Set(lines.map((l) => l.staffId).filter((id) => id !== ""))];
  const staffList = staffIds.length
    ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
    : [];
  const staffById = new Map(staffList.map((s) => [s.id, s]));

  return NextResponse.json(
    lines.map((l) => ({
      id: l.id,
      staffId: l.staffId,
      staffName: staffById.get(l.staffId)?.name ?? null,
      type: l.type,
      plantTypeCode: l.plantType.code,
      plantTypeName: l.plantType.name,
      stageCode: l.stageCode,
      quantity: l.quantity,
      createdAt: l.createdAt,
    }))
  );
}

const entrySchema = z.object({
  plantTypeId: z.string(),
  stageCode: z.string(),
  category: z.enum(["DANG_THUC_HIEN", "LO_BAN_GIAO"]),
  huyQuantity: z.number().int().min(0),
  trongQuantity: z.number().int().min(0),
});
const postSchema = z.object({
  staffId: z.string(), // "" = tồn cũ/không rõ NV
  entries: z.array(entrySchema).min(1),
});

// "Gộp phiếu" — chuyển 1 phần số dư "chờ xử lý" của 1 NV (hoặc bucket "") thành các dòng nháp (status
// DRAFT), trừ ngay khỏi ContaminationStaffBalance VÀ Lot Phòng nhiễm (số đã "gộp phiếu" coi như đã có
// chủ, không cho báo trùng) — chưa gửi Admin, đợi "Gửi đề xuất trồng/hủy" mới thực sự tạo đề xuất PENDING.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Chỉ NV kho mô mới có quyền" }, { status: 403 });
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 403 });

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { staffId, entries } = parsed.data;

  const usable = entries.filter((e) => e.huyQuantity > 0 || e.trongQuantity > 0);
  if (usable.length === 0) return NextResponse.json({ message: "Chưa nhập số lượng nào" }, { status: 400 });

  const room = await prisma.room.findFirst({ where: { warehouseId, type: "PHONG_NHIEM" } });
  if (!room) return NextResponse.json({ message: "Kho này chưa có Phòng nhiễm" }, { status: 400 });

  const created: { type: "HUY" | "TRONG"; plantTypeId: string; stageCode: string; quantity: number }[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      for (const e of usable) {
        const total = e.huyQuantity + e.trongQuantity;
        const category: ContaminationBalanceCategory = e.category;
        const balance = await tx.contaminationStaffBalance.findUnique({
          where: { warehouseId_staffId_plantTypeId_stageCode_category: { warehouseId, staffId, plantTypeId: e.plantTypeId, stageCode: e.stageCode, category } },
        });
        if (!balance || balance.quantity < total) {
          throw new Error(`Số dư không đủ cho 1 dòng (còn ${balance?.quantity ?? 0}, cần ${total})`);
        }
        const lot = await tx.lot.findFirst({ where: { roomId: room.id, plantTypeId: e.plantTypeId, stageCode: e.stageCode, status: "ACTIVE" } });
        if (!lot || lot.quantity < total) {
          throw new Error(`Phòng nhiễm không đủ số lượng cho 1 dòng (còn ${lot?.quantity ?? 0}, cần ${total})`);
        }

        await tx.contaminationStaffBalance.update({ where: { id: balance.id }, data: { quantity: { decrement: total } } });
        await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: total } } });

        if (e.huyQuantity > 0) {
          const code = await generateContaminationProposalCode("HUY", new Date(), tx);
          await tx.contaminationProposal.create({
            data: {
              code, type: "HUY", status: "DRAFT", warehouseId, plantTypeId: e.plantTypeId, stageCode: e.stageCode,
              quantity: e.huyQuantity, staffId, requestedById: session.user.id,
            },
          });
          created.push({ type: "HUY", plantTypeId: e.plantTypeId, stageCode: e.stageCode, quantity: e.huyQuantity });
        }
        if (e.trongQuantity > 0) {
          const code = await generateContaminationProposalCode("TRONG", new Date(), tx);
          await tx.contaminationProposal.create({
            data: {
              code, type: "TRONG", status: "DRAFT", warehouseId, plantTypeId: e.plantTypeId, stageCode: e.stageCode,
              quantity: e.trongQuantity, staffId, requestedById: session.user.id,
            },
          });
          created.push({ type: "TRONG", plantTypeId: e.plantTypeId, stageCode: e.stageCode, quantity: e.trongQuantity });
        }
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
    return NextResponse.json({ message }, { status: 400 });
  }

  return NextResponse.json({ success: true, created });
}
