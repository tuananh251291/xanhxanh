import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateContaminationProposalCode } from "@/lib/codes";
import { createAlertForMarketSaleStaff } from "@/lib/inventory";
import { deductFromRoomFifo, InsufficientRoomStockError } from "@/lib/finished-goods";
import { MARKET_ROOM_TYPES, POT_STAGE_CODE_LIST } from "@/lib/market-inspection";
import { FREE_GIFT_PLANT_CODE } from "@/types";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const schema = z.object({
  dailyTaskId: z.string(),
  roomId: z.string(),
  lines: z.array(z.object({
    type: z.enum(["TRONG", "HUY"]),
    plantTypeId: z.string(),
    stageCode: z.string(),
    quantity: z.number().int().positive(),
    photoUrls: z.array(z.string()).min(1, "Cần đính kèm ít nhất 1 ảnh bằng chứng"),
    plantStageCode: z.string().optional(),
  })).min(1),
});

// Đối tác vận hành gửi TOÀN BỘ các dòng của 1 việc kiểm tra tuần trong CÙNG 1 transaction — hoặc tất cả
// thành công, hoặc không dòng nào được ghi và không trừ tồn. Nếu gửi từng dòng riêng lẻ, 1 dòng lỗi sẽ để
// lại các dòng trước đã trừ tồn + khoá việc (mỗi việc chỉ "Thực hiện" 1 lần), dòng lỗi không còn chỗ nhập lại.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "DOI_TAC_VAN_HANH") {
    return NextResponse.json({ message: "Chỉ Đối tác vận hành mới gửi được đề xuất này" }, { status: 403 });
  }
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc — không thể gửi đề xuất" }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { dailyTaskId, roomId, lines } = parsed.data;

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.warehouseId !== warehouseId || !(MARKET_ROOM_TYPES as readonly string[]).includes(room.type)) {
    return NextResponse.json({ message: "Phòng không hợp lệ" }, { status: 400 });
  }

  const task = await prisma.dailyTask.findUnique({ where: { id: dailyTaskId }, select: { type: true, status: true, assignedToId: true, roomId: true } });
  if (task?.type !== "DE_XUAT_TRONG_HUY" || task.status !== "PENDING" || task.assignedToId !== session.user.id) {
    return NextResponse.json({ message: "Nhiệm vụ không hợp lệ" }, { status: 400 });
  }
  if (task.roomId && task.roomId !== roomId) {
    return NextResponse.json({ message: "Nhiệm vụ này chỉ kiểm tra đúng phòng đã giao" }, { status: 400 });
  }

  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.plantTypeId))] } },
    select: { id: true, code: true },
  });
  const plantCodeById = new Map(plantTypes.map((p) => [p.id, p.code]));

  for (const l of lines) {
    const plantCode = plantCodeById.get(l.plantTypeId);
    if (!plantCode) return NextResponse.json({ message: "Mã cây không hợp lệ" }, { status: 400 });
    if (l.type !== "TRONG") continue;
    if (plantCode === FREE_GIFT_PLANT_CODE) return NextResponse.json({ message: "Cây Free Gift chỉ đề xuất Hủy được" }, { status: 400 });
    if (!l.plantStageCode || !(POT_STAGE_CODE_LIST as string[]).includes(l.plantStageCode)) {
      return NextResponse.json({ message: `${plantCode}: chọn quy cách chậu (S/M/L/X/Y/Z/C) cho phần Trồng` }, { status: 400 });
    }
    if (room.type === "PHONG_CAY_TRONG" && l.plantStageCode === l.stageCode) {
      return NextResponse.json({ message: `${plantCode}: Trồng lại trong Phòng cây trồng phải chọn quy cách chậu KHÁC quy cách hiện tại (${l.stageCode})` }, { status: 400 });
    }
  }

  let codes: string[];
  try {
    codes = await prisma.$transaction(async (tx) => {
      const existing = await tx.contaminationProposal.count({ where: { dailyTaskId, status: { not: "DRAFT" } } });
      if (existing > 0) throw new InsufficientRoomStockError("Nhiệm vụ này đã được gửi đề xuất, đang chờ QL thị trường duyệt");

      // Mọi đề xuất cùng loại, cùng kho, cùng ngày (giờ VN) gộp chung 1 phiếu để QL thị trường duyệt 1 lần.
      const vnDay = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
      const batchByType = new Map<"TRONG" | "HUY", string>();
      const created: string[] = [];
      for (const l of lines) {
        await deductFromRoomFifo(tx, roomId, l.plantTypeId, l.stageCode, l.quantity, `${plantCodeById.get(l.plantTypeId)} ${l.stageCode}`);
        // Truyền tx để thấy cả các mã vừa tạo trong chính transaction này.
        const code = await generateContaminationProposalCode(l.type, new Date(), tx);
        let batchCode = batchByType.get(l.type);
        if (!batchCode) {
          const dayHead = await tx.contaminationProposal.findFirst({
            where: { warehouseId, type: l.type, status: { not: "DRAFT" }, createdAt: { gte: new Date(`${vnDay}T00:00:00+07:00`) } },
            orderBy: { createdAt: "asc" },
            select: { code: true, batchCode: true },
          });
          batchCode = dayHead ? dayHead.batchCode ?? dayHead.code : code;
          batchByType.set(l.type, batchCode);
        }
        await tx.contaminationProposal.create({
          data: {
            code, batchCode, type: l.type, warehouseId, roomId, dailyTaskId,
            plantTypeId: l.plantTypeId, stageCode: l.stageCode, quantity: l.quantity, photoUrls: l.photoUrls,
            plantStageCode: l.type === "TRONG" ? l.plantStageCode : null,
            requestedById: session.user.id,
          },
        });
        created.push(code);
      }
      return created;
    }, { timeout: 30000 });
  } catch (err) {
    if (err instanceof InsufficientRoomStockError) return NextResponse.json({ message: err.message }, { status: 409 });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ message: "Trùng mã phiếu do có người gửi cùng lúc — chưa có dòng nào được ghi, vui lòng gửi lại" }, { status: 409 });
    }
    throw err;
  }

  await createAlertForMarketSaleStaff({
    warehouseId,
    type: "CONTAMINATION_PROPOSAL",
    title: "Có đề xuất Trồng/Hủy mới",
    message: `${session.user.name} gửi ${codes.length} đề xuất Trồng/Hủy tại ${room.name} — phiếu ${codes.join(", ")}`,
    relatedType: "ContaminationProposal",
  });

  return NextResponse.json({ count: codes.length }, { status: 201 });
}
