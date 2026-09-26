import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isKhoThanhPhamRole } from "@/types";
import { generateContaminationProposalCode } from "@/lib/codes";
import { createAlert, createAlertForMarketSaleStaff } from "@/lib/inventory";
import { FINISHED_GOODS_ROOM_TYPES } from "@/lib/finished-goods";
import { MARKET_ROOM_TYPES } from "@/lib/market-inspection";
import { z } from "zod";

const createSchema = z.object({
  type: z.enum(["TRONG", "HUY"]),
  plantTypeId: z.string(),
  stageCode: z.string(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
  // Bắt buộc khi người gửi là Kho thành phẩm (xem isKhoThanhPhamRole) — phòng thật đã chọn lô để trừ,
  // 1 trong 4 loại phòng thành phẩm của đúng kho làm việc. Kho mô không dùng field này (vẫn dò Phòng
  // nhiễm như cũ theo warehouseId).
  roomId: z.string().optional(),
  // Mã đề xuất gộp — client truyền lại code của dòng đầu tiên trong cùng 1 lần bấm "Gửi đề xuất" (nhiều
  // dòng cây) để nhóm chung 1 "đề xuất" khi hiển thị. Bỏ trống với dòng đầu tiên của mỗi lần gửi.
  batchCode: z.string().optional(),
  // Bắt buộc khi type=TRONG và người gửi là Kho thành phẩm (roomId có giá trị) — Vườn sản xuất sẽ nhận
  // cây. Kho mô không dùng field này (Trồng lại đi qua ReplantHandover→NHAN_VIEN_SAN_XUAT như cũ).
  productionGardenId: z.string().optional(),
  // Có giá trị khi gửi từ "Thực hiện" 1 DailyTask (type=DE_XUAT_TRONG_HUY, xem
  // /task-assignment/de-xuat/[taskId]) — dùng để tính nhiệm vụ đó đã hoàn thành hay chưa.
  dailyTaskId: z.string().optional(),
  // Ảnh bằng chứng (đã tải lên trước qua POST /api/contamination-proposals/photos) — CHỈ bắt buộc khi
  // người gửi là Đối tác vận hành (xem nhánh isMarketPartner bên dưới), Kho mô/Kho thành phẩm bỏ trống.
  photoUrls: z.array(z.string()).default([]),
});

const include = {
  plantType: { select: { code: true, name: true } },
  warehouse: { select: { code: true, name: true } },
  room: { select: { name: true } },
  requestedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  productionGarden: { select: { code: true, name: true } },
} as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = session.user.role;

  // Dòng nháp (status DRAFT, chưa "Gửi đề xuất trồng/hủy") không hiện ở danh sách chung — xem
  // GET /api/contamination-proposal-drafts cho phiếu chung đang gộp dở của Kho mô.
  const where: Record<string, unknown> = status ? { status } : { status: { not: "DRAFT" } };
  // Kho mô/Kho thành phẩm/Đối tác vận hành chỉ thấy đề xuất của đúng kho mình đang làm việc — Admin thấy
  // tất cả để duyệt. NV bán hàng (isRetailManager) chỉ thấy đề xuất của (các) Kho thị trường được gán qua
  // RetailWarehouseAccess (đúng những đề xuất do Đối tác vận hành gửi — kho SAN_XUAT/THANH_PHAM không ai
  // gán RetailWarehouseAccess tới nên không lộ nhầm sang đây).
  if (role === "KHO_MO" || isKhoThanhPhamRole(role) || role === "DOI_TAC_VAN_HANH") {
    if (!session.user.workplaceWarehouseId) return NextResponse.json([]);
    where.warehouseId = session.user.workplaceWarehouseId;
  } else if (role === "SALE") {
    const access = await prisma.retailWarehouseAccess.findMany({
      where: { userId: session.user.id },
      select: { warehouseId: true },
    });
    if (access.length === 0) return NextResponse.json([]);
    where.warehouseId = { in: access.map((a) => a.warehouseId) };
  } else if (!isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const proposals = await prisma.contaminationProposal.findMany({
    where,
    include,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(proposals);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  const isFinishedGoods = isKhoThanhPhamRole(role);
  const isMarketPartner = role === "DOI_TAC_VAN_HANH";
  if (role !== "KHO_MO" && !isFinishedGoods && !isMarketPartner) {
    return NextResponse.json({ message: "Chỉ NV kho mô, Kho thành phẩm hoặc Đối tác vận hành mới có quyền gửi đề xuất" }, { status: 403 });
  }
  if (!session!.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc — không thể gửi đề xuất" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { type, plantTypeId, stageCode, quantity, notes, roomId, batchCode: requestedBatchCode, productionGardenId, dailyTaskId, photoUrls } = parsed.data;
  const warehouseId = session!.user.workplaceWarehouseId;

  let lotId: string;
  let sourceRoomId: string | null = null;
  let sourceRoomName: string | null = null;

  if (isFinishedGoods) {
    if (!roomId) return NextResponse.json({ message: "Chưa chọn phòng" }, { status: 400 });
    if (type === "TRONG") {
      if (!productionGardenId) return NextResponse.json({ message: "Chưa chọn Vườn sản xuất" }, { status: 400 });
      const garden = await prisma.productionGarden.findUnique({ where: { id: productionGardenId }, select: { isActive: true } });
      if (!garden || !garden.isActive) return NextResponse.json({ message: "Vườn sản xuất không hợp lệ" }, { status: 400 });
    }
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.warehouseId !== warehouseId || !(FINISHED_GOODS_ROOM_TYPES as readonly string[]).includes(room.type)) {
      return NextResponse.json({ message: "Phòng không hợp lệ" }, { status: 400 });
    }
    const lot = await prisma.lot.findFirst({ where: { roomId, plantTypeId, stageCode, status: "ACTIVE" } });
    if (!lot || lot.quantity < quantity) {
      return NextResponse.json(
        { message: `${room.name} không có đủ số lượng cho mã cây/quy cách này (còn ${lot?.quantity ?? 0})` },
        { status: 400 }
      );
    }
    lotId = lot.id;
    sourceRoomId = room.id;
    sourceRoomName = room.name;
  } else if (isMarketPartner) {
    // Đối tác vận hành ở Kho thị trường — KHÔNG bắt buộc chọn Vườn sản xuất kể cả với đề xuất Trồng
    // (khác hẳn Kho thành phẩm) vì kho thị trường không gắn với 1 vườn cụ thể nào, xem
    // de-xuat-execute-form.tsx (gardens=[] cho vai trò này).
    // Bắt buộc ≥1 ảnh bằng chứng cho đúng luồng này (Kho mô/Kho thành phẩm không bị ràng buộc) — Admin
    // duyệt cần ảnh đối chiếu, giống hệt tính năng Phân loại hàng không đạt.
    if (photoUrls.length === 0) return NextResponse.json({ message: "Cần đính kèm ít nhất 1 ảnh bằng chứng" }, { status: 400 });
    if (!roomId) return NextResponse.json({ message: "Chưa chọn phòng" }, { status: 400 });
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.warehouseId !== warehouseId || !(MARKET_ROOM_TYPES as readonly string[]).includes(room.type)) {
      return NextResponse.json({ message: "Phòng không hợp lệ" }, { status: 400 });
    }
    const lot = await prisma.lot.findFirst({ where: { roomId, plantTypeId, stageCode, status: "ACTIVE" } });
    if (!lot || lot.quantity < quantity) {
      return NextResponse.json(
        { message: `${room.name} không có đủ số lượng cho mã cây/quy cách này (còn ${lot?.quantity ?? 0})` },
        { status: 400 }
      );
    }
    lotId = lot.id;
    sourceRoomId = room.id;
    sourceRoomName = room.name;
  } else {
    const room = await prisma.room.findFirst({ where: { warehouseId, type: "PHONG_NHIEM" } });
    const lot = room
      ? await prisma.lot.findFirst({ where: { roomId: room.id, plantTypeId, stageCode, status: "ACTIVE" } })
      : null;
    if (!lot || lot.quantity < quantity) {
      return NextResponse.json(
        { message: `Phòng nhiễm không có đủ số lượng cho mã cây/quy cách này (còn ${lot?.quantity ?? 0})` },
        { status: 400 }
      );
    }
    lotId = lot.id;
  }

  if (dailyTaskId) {
    const task = await prisma.dailyTask.findUnique({ where: { id: dailyTaskId }, select: { type: true, assignedToId: true } });
    const canUseTask = task?.type === "DE_XUAT_TRONG_HUY" && (
      task.assignedToId === session!.user.id || session!.user.role === "QUAN_LY_KHO_THANH_PHAM" || isAdminRole(session!.user.role)
    );
    if (!canUseTask) return NextResponse.json({ message: "Nhiệm vụ không hợp lệ" }, { status: 400 });
  }

  const code = await generateContaminationProposalCode(type);

  // Chỉ nhận batchCode do client truyền lại nếu đúng là code của 1 dòng đã tạo trước đó, cùng người gửi,
  // cùng kho, cùng loại Trồng/Hủy — tránh gộp nhầm đề xuất không liên quan nếu client gửi sai dữ liệu.
  let batchCode = code;
  if (requestedBatchCode) {
    const head = await prisma.contaminationProposal.findFirst({
      where: { code: requestedBatchCode, requestedById: session!.user.id, warehouseId, type },
    });
    if (head) batchCode = head.batchCode ?? head.code;
  }

  const proposal = await prisma.$transaction(async (tx) => {
    await tx.lot.update({ where: { id: lotId }, data: { quantity: { decrement: quantity } } });
    return tx.contaminationProposal.create({
      data: {
        code,
        batchCode,
        type,
        warehouseId,
        roomId: sourceRoomId,
        productionGardenId: type === "TRONG" ? productionGardenId : null,
        dailyTaskId,
        plantTypeId,
        stageCode,
        quantity,
        notes,
        photoUrls,
        requestedById: session!.user.id,
      },
      include,
    });
  });

  const typeLabel = type === "TRONG" ? "Trồng lại" : "Hủy bỏ";
  const locationSuffix = sourceRoomName ? ` tại ${sourceRoomName}` : "";
  const alertMessage = `${session!.user.name} đề xuất "${typeLabel}" ${quantity.toLocaleString("vi-VN")} ${proposal.plantType.name} (${stageCode})${locationSuffix} — phiếu ${code}`;
  // Đề xuất của Đối tác vận hành báo NV bán hàng phụ trách thị trường (RetailWarehouseAccess) duyệt,
  // KHÁC Kho mô/Kho thành phẩm vẫn báo Admin như cũ (xem canApprove ở page.tsx/PATCH bên dưới).
  if (isMarketPartner) {
    await createAlertForMarketSaleStaff({
      warehouseId,
      type: "CONTAMINATION_PROPOSAL",
      title: "Có đề xuất Trồng/Hủy mới",
      message: alertMessage,
      relatedId: proposal.id,
      relatedType: "ContaminationProposal",
    });
  } else {
    for (const targetRole of ["ADMIN", "SUPER_ADMIN"] as const) {
      await createAlert({
        type: "CONTAMINATION_PROPOSAL",
        title: "Có đề xuất Trồng/Hủy mới",
        message: alertMessage,
        targetRole,
        relatedId: proposal.id,
        relatedType: "ContaminationProposal",
      });
    }
  }

  return NextResponse.json(proposal, { status: 201 });
}
