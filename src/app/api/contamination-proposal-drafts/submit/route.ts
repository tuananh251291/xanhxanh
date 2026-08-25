import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateContaminationProposalCode } from "@/lib/codes";

type Group = { type: "HUY" | "TRONG"; plantTypeId: string; stageCode: string; quantity: number };

// Từ mã ĐẦU TIÊN đã sinh cho 1 loại (VD "H170826" hoặc "H170826-3" nếu trong ngày đã có sẵn đề xuất
// khác), tính tiếp N-1 mã kế tiếp CÙNG loại bằng cách tăng hậu tố trong bộ nhớ — không gọi lại
// generateContaminationProposalCode (tốn 1 query/lần) cho TỪNG dòng mã cây, vì 1 lần "Gửi đề xuất" có
// thể gộp tới vài chục loại cây khác nhau (từng gây lỗi thật "A query cannot be executed on an expired
// transaction" khi dồn N query vào 1 interactive transaction 5s — xem thêm ghi chú ở lib/codes.ts).
function expandCodes(firstCode: string, count: number): string[] {
  if (count === 0) return [];
  const dashIdx = firstCode.lastIndexOf("-");
  const base = dashIdx === -1 ? firstCode : firstCode.slice(0, dashIdx);
  const startN = dashIdx === -1 ? 1 : parseInt(firstCode.slice(dashIdx + 1), 10);
  const codes = [firstCode];
  for (let i = 1; i < count; i++) codes.push(`${base}-${startN + i}`);
  return codes;
}

// "Gửi đề xuất trồng/hủy" — gộp TẤT CẢ dòng nháp (status DRAFT, có thể từ nhiều NV cấy mô/nhiều ngày)
// của kho sản xuất mình đang làm việc theo (loại, mã cây, quy cách), tạo thành các đề xuất PENDING thật
// gửi Admin duyệt (2 batchCode — 1 cho toàn bộ dòng Hủy, 1 cho toàn bộ dòng Trồng của lần gửi này, xem
// POST /api/contamination-proposals cho quy ước batchCode tương tự). Số lượng đã bị trừ khỏi Phòng nhiễm
// và ContaminationStaffBalance ngay lúc "Gộp phiếu" nên ở đây chỉ cần gộp dòng, không đụng tới tồn kho.
//
// Sinh mã NGOÀI transaction (chỉ 1 query/loại, xem expandCodes) rồi tạo hàng loạt bằng createMany thay
// vì tạo từng dòng 1 bên trong interactive transaction — tránh timeout 5s khi phiếu gộp nhiều loại cây.
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Chỉ NV kho mô mới có quyền" }, { status: 403 });
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 403 });

  const draftLines = await prisma.contaminationProposal.findMany({ where: { warehouseId, status: "DRAFT" } });
  if (draftLines.length === 0) return NextResponse.json({ message: "Chưa có dòng nào trong phiếu chung để gửi" }, { status: 400 });

  const groups = new Map<string, Group>();
  for (const line of draftLines) {
    const key = `${line.type}|${line.plantTypeId}|${line.stageCode}`;
    const g = groups.get(key);
    if (g) g.quantity += line.quantity;
    else groups.set(key, { type: line.type, plantTypeId: line.plantTypeId, stageCode: line.stageCode, quantity: line.quantity });
  }
  const huyGroups = [...groups.values()].filter((g) => g.type === "HUY");
  const trongGroups = [...groups.values()].filter((g) => g.type === "TRONG");

  const now = new Date();
  const [huyFirstCode, trongFirstCode] = await Promise.all([
    huyGroups.length > 0 ? generateContaminationProposalCode("HUY", now) : Promise.resolve(null),
    trongGroups.length > 0 ? generateContaminationProposalCode("TRONG", now) : Promise.resolve(null),
  ]);
  const huyCodes = huyFirstCode ? expandCodes(huyFirstCode, huyGroups.length) : [];
  const trongCodes = trongFirstCode ? expandCodes(trongFirstCode, trongGroups.length) : [];

  const rows = [
    ...huyGroups.map((g, i) => ({
      code: huyCodes[i], batchCode: huyCodes[0], type: "HUY" as const, status: "PENDING" as const, warehouseId,
      plantTypeId: g.plantTypeId, stageCode: g.stageCode, quantity: g.quantity, staffId: "", requestedById: session.user.id,
    })),
    ...trongGroups.map((g, i) => ({
      code: trongCodes[i], batchCode: trongCodes[0], type: "TRONG" as const, status: "PENDING" as const, warehouseId,
      plantTypeId: g.plantTypeId, stageCode: g.stageCode, quantity: g.quantity, staffId: "", requestedById: session.user.id,
    })),
  ];
  const allCodes = rows.map((r) => r.code);

  await prisma.$transaction([
    prisma.contaminationProposal.deleteMany({ where: { warehouseId, status: "DRAFT" } }),
    prisma.contaminationProposal.createMany({ data: rows }),
  ]);

  const created = await prisma.contaminationProposal.findMany({
    where: { code: { in: allCodes } },
    include: { plantType: { select: { name: true } } },
  });

  const alertRows = created.flatMap((p) => {
    const typeLabel = p.type === "TRONG" ? "Trồng lại" : "Hủy bỏ";
    const message = `${session.user.name} đề xuất "${typeLabel}" ${p.quantity.toLocaleString("vi-VN")} ${p.plantType.name} (${p.stageCode}) — phiếu ${p.batchCode}`;
    return (["ADMIN", "SUPER_ADMIN"] as const).map((targetRole) => ({
      type: "CONTAMINATION_PROPOSAL" as const,
      title: "Có đề xuất Trồng/Hủy hàng nhiễm mới",
      message,
      targetRole,
      relatedId: p.id,
      relatedType: "ContaminationProposal",
    }));
  });
  if (alertRows.length > 0) await prisma.alert.createMany({ data: alertRows });

  return NextResponse.json({ success: true, count: created.length });
}
