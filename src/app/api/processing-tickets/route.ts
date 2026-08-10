import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateProcessingTicketCode, generateLotCode } from "@/lib/codes";
import { getQualifiedLots } from "@/lib/order-availability";
import { getFinishedQualifiedRooms } from "@/lib/processing";
import { z } from "zod";

// T10 (túi 10 cây) chỉ phát sinh trong Kho thành phẩm — xem cùng ghi chú ở api/orders/check/route.ts.
const FINISHED_STAGE_CODES = new Set(["T01", "T05", "T10"]);

const createSchema = z
  .object({
    roomId: z.string().min(1),
    plantTypeId: z.string().min(1),
    inputStageCode: z.string(),
    inputQuantity: z.number().int().positive(),
    outputStageCode: z.string(),
    outputQuantity: z.number().int().positive(),
    notes: z.string().optional(),
    dueAt: z.string().optional(),
  })
  .refine((d) => d.outputQuantity <= d.inputQuantity, {
    message: "Số lượng đầu ra không được lớn hơn số lượng đầu vào",
    path: ["outputQuantity"],
  });

// "Tạo phiếu xử lý" — trừ ngay số lượng đầu vào (FIFO qua các lô ACTIVE), cộng/tạo lô đầu ra ngay
// trong cùng transaction (phiếu là biên bản ghi việc đã xử lý xong, không có luồng "đang xử lý" chờ
// duyệt). Đọc lại tồn đạt tiêu chuẩn NGAY TRONG transaction (không tin số đã xem trước đó trên form).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_THANH_PHAM" && session?.user?.role !== "QUAN_LY_KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ NV kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { roomId, plantTypeId, inputStageCode, inputQuantity, outputStageCode, outputQuantity, notes, dueAt } = parsed.data;

  if (!FINISHED_STAGE_CODES.has(inputStageCode) || !FINISHED_STAGE_CODES.has(outputStageCode)) {
    return NextResponse.json({ message: "Quy cách không hợp lệ (T01/T05/T10)" }, { status: 400 });
  }

  const validRooms = await getFinishedQualifiedRooms();
  if (!validRooms.some((r) => r.id === roomId)) {
    return NextResponse.json({ message: "Phòng không hợp lệ — chỉ áp dụng Phòng đạt tiêu chuẩn của kho thành phẩm" }, { status: 400 });
  }

  const [plantType, creatingUser] = await Promise.all([
    prisma.plantType.findUnique({ where: { id: plantTypeId }, select: { id: true, code: true, isActive: true } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } }),
  ]);
  if (!plantType || !plantType.isActive) {
    return NextResponse.json({ message: "Loại cây không hợp lệ" }, { status: 400 });
  }

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const lots = await getQualifiedLots([roomId], plantTypeId, inputStageCode, tx);
      const totalAvailable = lots.reduce((s, l) => s + l.available, 0);
      if (totalAvailable < inputQuantity) {
        throw new Error(`Tồn kho đạt tiêu chuẩn không đủ — quy cách ${inputStageCode} chỉ còn ${totalAvailable}/${inputQuantity} cần xử lý`);
      }

      const inputAllocations: { lotId: string; quantity: number }[] = [];
      let remaining = inputQuantity;
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.available, remaining);
        if (take <= 0) continue;
        await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
        inputAllocations.push({ lotId: lot.id, quantity: take });
        remaining -= take;
      }

      const existingOutputLot = await tx.lot.findFirst({
        where: { roomId, plantTypeId, stageCode: outputStageCode, status: "ACTIVE" },
        orderBy: { enteredAt: "asc" },
      });

      let outputLotId: string;
      if (existingOutputLot) {
        await tx.lot.update({ where: { id: existingOutputLot.id }, data: { quantity: { increment: outputQuantity } } });
        outputLotId = existingOutputLot.id;
      } else {
        const code = await generateLotCode({
          plantTypeCode: plantType.code,
          staffCode: creatingUser?.code ?? "000",
          stageCode: outputStageCode,
          client: tx,
        });
        const created = await tx.lot.create({
          data: {
            code,
            plantTypeId,
            stage: "THANH_PHAM",
            stageCode: outputStageCode,
            roomId,
            quantity: outputQuantity,
            initialQuantity: outputQuantity,
            status: "ACTIVE",
          },
        });
        outputLotId = created.id;
      }

      const ticketCode = await generateProcessingTicketCode(tx);
      return tx.processingTicket.create({
        data: {
          code: ticketCode,
          roomId,
          plantTypeId,
          inputStageCode,
          inputQuantity,
          outputStageCode,
          outputQuantity,
          outputLotId,
          notes,
          dueAt: dueAt ? new Date(dueAt) : null,
          createdById: session.user.id,
          inputLots: { create: inputAllocations },
        },
      });
    });

    return NextResponse.json(ticket, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
    return NextResponse.json({ message }, { status: 400 });
  }
}
