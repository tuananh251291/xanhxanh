import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateGardenCareTicketCode } from "@/lib/codes";
import { canReportOnLot, getCareStaffProfile, CARE_POOLS } from "@/lib/garden-care";
import { z } from "zod";

const schema = z.object({ lotId: z.string().min(1), type: z.enum(["DAMAGE", "SIZE_S"]) });

// Mở phiếu ghi nhận cây hỏng khi chăm sóc (DAMAGE) hoặc cập nhật cây đạt size S (SIZE_S) cho 1 lô — DRAFT, mỗi
// dòng tồn ĐÃ XẾP vị trí của lô đang chăm sóc (Kho nhiễm/Kho cây trồng) là 1 dòng phiếu (số = 0, NV nhập). Mỗi lô
// chỉ 1 phiếu đang mở cho mỗi loại.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { lotId, type } = parsed.data;

  const lot = await prisma.gardenCareLot.findUnique({
    where: { id: lotId },
    select: {
      id: true, code: true, gardenId: true, staffId: true,
      stockLines: { where: { pool: { in: [...CARE_POOLS] }, quantity: { gt: 0 }, rowId: { not: null } }, select: { id: true, rowId: true } },
    },
  });
  if (!lot) return NextResponse.json({ message: "Không tìm thấy lô" }, { status: 404 });
  if (!(await canReportOnLot(session.user, lot))) return NextResponse.json({ message: "Chỉ NV phụ trách lô hoặc Quản lý vườn được lập phiếu" }, { status: 403 });
  if (lot.stockLines.length === 0) return NextResponse.json({ message: "Lô chưa được sắp xếp vào dãy nào — QLV cần sắp xếp vị trí trước" }, { status: 400 });

  const open = await prisma.gardenCareTicket.findFirst({ where: { lotId, type, status: { not: "CONFIRMED" } }, select: { id: true, code: true } });
  if (open) return NextResponse.json({ message: `Lô ${lot.code} đang có phiếu ${open.code} chưa duyệt`, id: open.id }, { status: 409 });

  const profile = session.user.role === "NV_CHAM_SOC_CAY_MO" ? await getCareStaffProfile(session.user.id) : null;
  const ticket = await prisma.$transaction(async (tx) =>
    tx.gardenCareTicket.create({
      data: {
        code: await generateGardenCareTicketCode(tx), gardenId: lot.gardenId, lotId, type,
        staffId: profile?.id ?? lot.staffId, createdById: session.user.id,
        items: { create: lot.stockLines.map((l) => ({ rowId: l.rowId!, lineId: l.id, reportedQuantity: 0 })) },
      },
      select: { id: true, code: true },
    })
  );
  return NextResponse.json(ticket, { status: 201 });
}
