import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateContaminationProposalCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";

// "Gửi đề xuất trồng/hủy" — gộp TẤT CẢ dòng nháp (status DRAFT, có thể từ nhiều NV cấy mô/nhiều ngày)
// của kho sản xuất mình đang làm việc theo (loại, mã cây, quy cách), tạo thành các đề xuất PENDING thật
// gửi Admin duyệt (2 batchCode — 1 cho toàn bộ dòng Hủy, 1 cho toàn bộ dòng Trồng của lần gửi này, xem
// POST /api/contamination-proposals cho quy ước batchCode tương tự). Số lượng đã bị trừ khỏi Phòng nhiễm
// và ContaminationStaffBalance ngay lúc "Gộp phiếu" nên ở đây chỉ cần gộp dòng, không đụng tới tồn kho.
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Chỉ NV kho mô mới có quyền" }, { status: 403 });
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 403 });

  const draftLines = await prisma.contaminationProposal.findMany({ where: { warehouseId, status: "DRAFT" } });
  if (draftLines.length === 0) return NextResponse.json({ message: "Chưa có dòng nào trong phiếu chung để gửi" }, { status: 400 });

  const groups = new Map<string, { type: "HUY" | "TRONG"; plantTypeId: string; stageCode: string; quantity: number }>();
  for (const line of draftLines) {
    const key = `${line.type}|${line.plantTypeId}|${line.stageCode}`;
    const g = groups.get(key);
    if (g) g.quantity += line.quantity;
    else groups.set(key, { type: line.type, plantTypeId: line.plantTypeId, stageCode: line.stageCode, quantity: line.quantity });
  }

  const batchCodeByType: Record<"HUY" | "TRONG", string | undefined> = { HUY: undefined, TRONG: undefined };
  const submitted: { id: string; type: "HUY" | "TRONG"; plantTypeId: string; stageCode: string; quantity: number; plantTypeName: string }[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.contaminationProposal.deleteMany({ where: { warehouseId, status: "DRAFT" } });
    for (const g of groups.values()) {
      const code = await generateContaminationProposalCode(g.type, new Date(), tx);
      batchCodeByType[g.type] ??= code;
      const created = await tx.contaminationProposal.create({
        data: {
          code, batchCode: batchCodeByType[g.type], type: g.type, status: "PENDING", warehouseId,
          plantTypeId: g.plantTypeId, stageCode: g.stageCode, quantity: g.quantity, staffId: "", requestedById: session.user.id,
        },
        include: { plantType: { select: { name: true } } },
      });
      submitted.push({ id: created.id, type: g.type, plantTypeId: g.plantTypeId, stageCode: g.stageCode, quantity: g.quantity, plantTypeName: created.plantType.name });
    }
  });

  for (const s of submitted) {
    const typeLabel = s.type === "TRONG" ? "Trồng lại" : "Hủy bỏ";
    for (const targetRole of ["ADMIN", "SUPER_ADMIN"] as const) {
      await createAlert({
        type: "CONTAMINATION_PROPOSAL",
        title: "Có đề xuất Trồng/Hủy hàng nhiễm mới",
        message: `${session.user.name} đề xuất "${typeLabel}" ${s.quantity.toLocaleString("vi-VN")} ${s.plantTypeName} (${s.stageCode}) — phiếu ${batchCodeByType[s.type]}`,
        targetRole,
        relatedId: s.id,
        relatedType: "ContaminationProposal",
      });
    }
  }

  return NextResponse.json({ success: true, count: submitted.length });
}
