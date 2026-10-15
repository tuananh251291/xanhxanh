import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { createAlert, createAlertForWarehouseStaff } from "@/lib/inventory";
import { upsertLot } from "@/lib/goods-receipt";
import { generateLotCode } from "@/lib/codes";
import { deductFromRoomFifo, InsufficientRoomStockError } from "@/lib/finished-goods";
import { z } from "zod";

class InsufficientStockError extends Error {}

async function loadInstruction(id: string) {
  return prisma.repackInstruction.findUnique({
    where: { id },
    include: {
      plantType: { select: { id: true, code: true, name: true } },
      sourceShelf: { select: { id: true, code: true, name: true, warehouseId: true, warehouse: { select: { name: true, code: true } } } },
      sourceLot: { select: { id: true, code: true, quantity: true, stageCode: true } },
      ktpRoom: { select: { id: true, code: true, name: true, warehouseId: true } },
      createdBy: { select: { id: true, name: true, code: true } },
      assignedTo: { select: { id: true, name: true, code: true, workplaceWarehouseId: true } },
      assignedBy: { select: { name: true, code: true } },
      khoMoInspectedBy: { select: { name: true, code: true } },
      placedBy: { select: { name: true, code: true } },
      actualOutputShelf: { select: { code: true } },
      outputLot: { select: { id: true, code: true, quantity: true } },
    },
  });
}

type LoadedInstruction = NonNullable<Awaited<ReturnType<typeof loadInstruction>>>;

// Kho sản xuất đang thực hiện chỉ định — chỉ định thường suy ra từ kệ nguồn, chỉ định từ Phiếu xử lý Kho
// thành phẩm (ktpRoomId) lưu thẳng productionWarehouseId (không có kệ nguồn).
function productionWarehouseIdOf(instruction: LoadedInstruction): string | null {
  return instruction.productionWarehouseId ?? instruction.sourceShelf?.warehouseId ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Không có quyền" }, { status: 401 });

  const { id } = await params;
  const instruction = await loadInstruction(id);
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });

  const role = session.user.role;
  if (role === "CAY_MO" && instruction.assignedToId !== session.user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (role === "KY_THUAT" && instruction.createdById !== session.user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (role === "KHO_MO" && productionWarehouseIdOf(instruction) !== session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  return NextResponse.json(instruction);
}

const patchSchema = z.union([
  z.object({ assignedToId: z.string().min(1) }),
  z.object({ assignExtraWorkRequestId: z.string().min(1) }),
  z.object({ confirmReceived: z.literal(true) }),
  z.object({ reportInsufficientQuantity: z.object({ note: z.string().optional() }) }),
  z.object({ undoConfirmReceived: z.literal(true) }),
  z.object({
    handBack: z.object({
      reportedPassedQuantity: z.number().int().min(0),
      reportedFailedQuantity: z.number().int().min(0),
      notes: z.string().optional(),
    }),
  }),
  z.object({
    inspect: z.object({
      confirmedPassedQuantity: z.number().int().min(0),
      confirmedFailedQuantity: z.number().int().min(0),
    }),
  }),
  z.object({ cancel: z.literal(true) }),
  // Phiếu xử lý Kho thành phẩm — luồng bàn giao liên kho 2 chiều:
  // 1. Kho thành phẩm "Bàn giao" phiếu đang chờ (trừ Phòng chờ xử lý) → Kho mô khu sản xuất nhận.
  z.object({ ktpHandover: z.literal(true) }),
  // 2. Kho mô "Nhận" → cộng vào Phòng đợi xử lý (không giàn kệ — thành lô nguồn của chỉ định xử lý).
  z.object({ khoMoReceive: z.literal(true) }),
  // 3. Xử lý xong, đã xếp về Phòng đợi xử lý → Kho mô bàn giao liên kho lại cho Kho thành phẩm.
  z.object({ returnToKtp: z.literal(true) }),
  // Kho thành phẩm xác nhận nhận lại — đạt vào Phòng đạt tiêu chuẩn, không đạt về Phòng chờ xử lý.
  z.object({
    ktpReceive: z.object({
      passedQuantity: z.number().int().min(0),
      failedQuantity: z.number().int().min(0),
    }),
  }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Không có quyền" }, { status: 401 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const body = parsed.data;
  const role = session.user.role;

  const instruction = await loadInstruction(id);
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });

  // ---- KHO_MO chọn NV cấy mô thực hiện — mirror nhánh assignedToId "kệ chung" của PlantingInstruction ----
  if ("assignedToId" in body) {
    if (role !== "KHO_MO" && !isAdminRole(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (role === "KHO_MO" && productionWarehouseIdOf(instruction) !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Chỉ định không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (instruction.status !== "CREATED") {
      return NextResponse.json({ message: "Chỉ định đã được gán NV hoặc không còn ở trạng thái chờ gán" }, { status: 400 });
    }
    const staff = await prisma.user.findUnique({
      where: { id: body.assignedToId },
      select: { role: true, isActive: true, workplaceWarehouseId: true },
    });
    if (!staff || staff.role !== "CAY_MO" || !staff.isActive || staff.workplaceWarehouseId !== productionWarehouseIdOf(instruction)) {
      return NextResponse.json({ message: "Nhân viên cấy mô không hợp lệ cho kho này" }, { status: 400 });
    }
    const updated = await prisma.repackInstruction.update({
      where: { id },
      data: { assignedToId: body.assignedToId, assignedById: session.user.id, assignedAt: new Date(), status: "ASSIGNED" },
    });
    return NextResponse.json(updated);
  }

  // ---- Kho mô gán NV từ 1 đăng ký hoàn thành sớm/làm thêm ĐÃ DUYỆT (xem GET /api/extra-work-requests
  // ?availableToAssign=true) thay vì chọn tự do — dùng khi muốn ưu tiên giao việc cho NV đã báo rảnh
  // trong tuần. Đánh dấu đăng ký đó "đã dùng" (fulfilledAt/fulfilledRepackInstructionId) để không bị gán
  // trùng cho việc khác, cùng cơ chế với chỉ định cấy dự phòng (PATCH /api/instructions/[id]) — chỉ khác
  // ở field đích (fulfilledRepackInstructionId thay vì fulfilledInstructionId).
  if ("assignExtraWorkRequestId" in body) {
    if (role !== "KHO_MO" && !isAdminRole(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (role === "KHO_MO" && productionWarehouseIdOf(instruction) !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Chỉ định không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (instruction.status !== "CREATED") {
      return NextResponse.json({ message: "Chỉ định đã được gán NV hoặc không còn ở trạng thái chờ gán" }, { status: 400 });
    }
    const extraWorkRequest = await prisma.extraWorkRequest.findUnique({
      where: { id: body.assignExtraWorkRequestId },
      include: { staff: { select: { id: true, role: true, isActive: true, workplaceWarehouseId: true } } },
    });
    if (!extraWorkRequest) return NextResponse.json({ message: "Không tìm thấy đăng ký" }, { status: 404 });
    if (extraWorkRequest.staff.workplaceWarehouseId !== productionWarehouseIdOf(instruction)) {
      return NextResponse.json({ message: "Đăng ký không thuộc kho của chỉ định này" }, { status: 403 });
    }
    if (role === "KHO_MO" && extraWorkRequest.staff.workplaceWarehouseId !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Đăng ký không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (extraWorkRequest.status !== "APPROVED" || extraWorkRequest.fulfilledAt) {
      return NextResponse.json({ message: "Đăng ký này chưa được duyệt hoặc đã dùng cho việc khác" }, { status: 400 });
    }
    if (!extraWorkRequest.staff.isActive || extraWorkRequest.staff.role !== "CAY_MO") {
      return NextResponse.json({ message: "Nhân viên cấy mô không hợp lệ" }, { status: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.extraWorkRequest.update({
        where: { id: extraWorkRequest.id },
        data: { fulfilledAt: new Date(), fulfilledRepackInstructionId: id },
      });
      return tx.repackInstruction.update({
        where: { id },
        data: { assignedToId: extraWorkRequest.staffId, assignedById: session.user.id, assignedAt: new Date(), status: "ASSIGNED" },
      });
    });
    return NextResponse.json(updated);
  }

  // ---- NV cấy mô tự xác nhận "Nhận bàn giao" — TRỪ TỒN KHO ngay tại đây ----
  if ("confirmReceived" in body) {
    if (instruction.assignedToId !== session.user.id) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (instruction.status !== "ASSIGNED") {
      return NextResponse.json({ message: "Chỉ định không ở trạng thái chờ nhận bàn giao" }, { status: 400 });
    }
    // Phiếu xử lý Kho thành phẩm đã trừ tồn Phòng chờ xử lý ngay lúc tạo (hàng rời Kho thành phẩm) —
    // NV nhận bàn giao chỉ đổi trạng thái, không trừ lại.
    if (!instruction.sourceLotId) {
      const updated = await prisma.repackInstruction.update({ where: { id }, data: { staffConfirmedAt: new Date(), status: "IN_PROGRESS" } });
      return NextResponse.json(updated);
    }
    const sourceLotId = instruction.sourceLotId;
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const sourceLot = await tx.lot.findUnique({ where: { id: sourceLotId }, select: { quantity: true } });
        if (!sourceLot || sourceLot.quantity < instruction.inputQuantity) {
          throw new InsufficientStockError(
            `Lô nguồn không còn đủ số lượng (còn ${sourceLot?.quantity ?? 0}, cần ${instruction.inputQuantity})`
          );
        }
        await tx.lot.update({ where: { id: sourceLotId }, data: { quantity: { decrement: instruction.inputQuantity } } });
        return tx.repackInstruction.update({
          where: { id },
          data: { staffConfirmedAt: new Date(), status: "IN_PROGRESS" },
        });
      });
      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return NextResponse.json({ message: err.message }, { status: 409 });
      }
      throw err;
    }
  }

  // ---- NV cấy mô báo "Số lượng không đủ" thay vì "Nhận bàn giao" — số cây thực tế trên kệ không khớp
  // inputQuantity của chỉ định. KHÔNG trừ tồn kho (chưa từng xác nhận nhận) — chỉ đưa chỉ định về lại
  // CREATED (huỷ gán, Kho mô cần kiểm tra lại kệ trước khi gán lại) + báo cho đúng Kho mô đã gán biết.
  if ("reportInsufficientQuantity" in body) {
    if (instruction.assignedToId !== session.user.id) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (instruction.status !== "ASSIGNED") {
      return NextResponse.json({ message: "Chỉ định không ở trạng thái chờ nhận bàn giao" }, { status: 400 });
    }
    const { note } = body.reportInsufficientQuantity;
    const updated = await prisma.$transaction(async (tx) => {
      // Huỷ gán coi như huỷ luôn việc "dùng" đăng ký hoàn thành sớm/làm thêm (nếu NV được gán từ đó) —
      // trả lại đăng ký về trạng thái "khả dụng" để Kho mô chọn được NV khác (hoặc gán lại đúng NV cũ) từ
      // danh sách, cùng nguyên tắc undoHandover của chỉ định cấy dự phòng (PATCH /api/instructions/[id]).
      await tx.extraWorkRequest.updateMany({
        where: { fulfilledRepackInstructionId: id },
        data: { fulfilledAt: null, fulfilledRepackInstructionId: null },
      });
      return tx.repackInstruction.update({
        where: { id },
        data: {
          quantityIssueReportedAt: new Date(),
          quantityIssueReportedById: session.user.id,
          quantityIssueNote: note,
          assignedToId: null,
          assignedById: null,
          assignedAt: null,
          status: "CREATED",
        },
      });
    });
    if (instruction.assignedById) {
      await createAlert({
        type: "REPACK_QUANTITY_MISMATCH",
        title: "Chỉ định cấy xử lý báo số lượng không đủ",
        message: `${session.user.name} báo số lượng thực tế ${instruction.sourceShelf ? `trên kệ ${instruction.sourceShelf.code}` : "nhận từ Kho thành phẩm"} không khớp chỉ định ${instruction.code} (cần ${instruction.inputQuantity} ${instruction.inputStageCode})${note ? ` — ghi chú: ${note}` : ""} — cần kiểm tra lại trước khi gán NV khác.`,
        userId: instruction.assignedById,
        relatedId: instruction.id,
        relatedType: "RepackInstruction",
      });
    }
    return NextResponse.json(updated);
  }

  // ---- Kho mô/Admin hoàn tác "Nhận bàn giao" — HOÀN LẠI TỒN KHO ----
  if ("undoConfirmReceived" in body) {
    if (role !== "KHO_MO" && !isAdminRole(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (role === "KHO_MO" && productionWarehouseIdOf(instruction) !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Chỉ định không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (!instruction.staffConfirmedAt || instruction.staffHandedBackAt) {
      return NextResponse.json({ message: "Chỉ hoàn tác được khi NV đã nhận bàn giao nhưng chưa bàn giao kết quả" }, { status: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      if (instruction.sourceLotId) {
        await tx.lot.update({ where: { id: instruction.sourceLotId }, data: { quantity: { increment: instruction.inputQuantity } } });
      }
      return tx.repackInstruction.update({
        where: { id },
        data: { staffConfirmedAt: null, status: "ASSIGNED" },
      });
    });
    return NextResponse.json(updated);
  }

  // ---- NV cấy mô bàn giao kết quả cuối cùng (đạt/không đạt tự khai) ----
  if ("handBack" in body) {
    if (instruction.assignedToId !== session.user.id) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (instruction.status !== "IN_PROGRESS") {
      return NextResponse.json({ message: "Chỉ định không ở trạng thái đang xử lý" }, { status: 400 });
    }
    const { reportedPassedQuantity, reportedFailedQuantity, notes } = body.handBack;
    if (reportedPassedQuantity + reportedFailedQuantity > instruction.expectedOutputQuantity) {
      return NextResponse.json({ message: "Tổng số đạt + không đạt vượt quá số lượng dự kiến đầu ra" }, { status: 400 });
    }
    const updated = await prisma.repackInstruction.update({
      where: { id },
      data: {
        reportedPassedQuantity,
        reportedFailedQuantity,
        staffHandedBackAt: new Date(),
        notes: notes ?? instruction.notes,
        status: "PENDING_PLACEMENT",
      },
    });
    return NextResponse.json(updated);
  }

  // ---- Kho mô kiểm tra lại kết quả (giống mức độ review của chỉ định cấy bình thường) ----
  if ("inspect" in body) {
    if (role !== "KHO_MO" && !isAdminRole(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (role === "KHO_MO" && productionWarehouseIdOf(instruction) !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Chỉ định không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (instruction.status !== "PENDING_PLACEMENT") {
      return NextResponse.json({ message: "Chỉ định không ở trạng thái chờ kiểm tra" }, { status: 400 });
    }
    const { confirmedPassedQuantity, confirmedFailedQuantity } = body.inspect;
    if (confirmedPassedQuantity + confirmedFailedQuantity > instruction.expectedOutputQuantity) {
      return NextResponse.json({ message: "Tổng số đạt + không đạt vượt quá số lượng dự kiến đầu ra" }, { status: 400 });
    }
    const updated = await prisma.repackInstruction.update({
      where: { id },
      data: {
        confirmedPassedQuantity,
        confirmedFailedQuantity,
        creditedQuantity: confirmedPassedQuantity,
        khoMoInspectedAt: new Date(),
        khoMoInspectedById: session.user.id,
      },
    });
    return NextResponse.json(updated);
  }

  // ---- KY_THUAT/Admin hủy chỉ định — chỉ khi NV chưa nhận bàn giao. Phiếu xử lý Kho thành phẩm chỉ hủy được
  // khi Kho thành phẩm CHƯA bàn giao sang khu sản xuất (chưa trừ tồn nào) — Quản lý kho thành phẩm đã tạo
  // phiếu hoặc Admin. ----
  if ("cancel" in body) {
    const isKtpCreator = !!instruction.ktpRoomId && role === "QUAN_LY_KHO_THANH_PHAM" && instruction.createdById === session.user.id;
    if (role !== "KY_THUAT" && !isAdminRole(role) && !isKtpCreator) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (instruction.ktpRoomId && instruction.status !== "KTP_WAITING_HANDOVER") {
      return NextResponse.json({ message: "Phiếu xử lý đã bàn giao sang khu sản xuất — không hủy được nữa" }, { status: 400 });
    }
    if (role === "KY_THUAT" && instruction.createdById !== session.user.id) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    if (instruction.staffConfirmedAt) {
      return NextResponse.json({ message: "NV đã nhận bàn giao (đã trừ tồn kho) — không thể hủy nữa" }, { status: 400 });
    }
    if (instruction.status === "CANCELLED" || instruction.status === "COMPLETED") {
      return NextResponse.json({ message: "Chỉ định đã kết thúc" }, { status: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      // Hủy chỉ định thì đăng ký hoàn thành sớm/làm thêm đã dùng (nếu có) cũng phải trả lại "khả dụng" —
      // việc đó không còn tồn tại nữa, không được coi là đã "dùng" suất đăng ký của NV.
      await tx.extraWorkRequest.updateMany({
        where: { fulfilledRepackInstructionId: id },
        data: { fulfilledAt: null, fulfilledRepackInstructionId: null },
      });
      return tx.repackInstruction.update({ where: { id }, data: { status: "CANCELLED" } });
    });
    return NextResponse.json(updated);
  }

  // ---- Kho thành phẩm "Bàn giao" Phiếu xử lý sang khu sản xuất — TRỪ Phòng chờ xử lý tại đây ----
  if ("ktpHandover" in body) {
    if (role !== "KHO_THANH_PHAM" && role !== "QUAN_LY_KHO_THANH_PHAM" && !isAdminRole(role)) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    if (!instruction.ktpRoom || instruction.status !== "KTP_WAITING_HANDOVER") {
      return NextResponse.json({ message: "Phiếu xử lý không ở trạng thái chờ bàn giao" }, { status: 400 });
    }
    if (role !== "SUPER_ADMIN" && role !== "ADMIN" && instruction.ktpRoom.warehouseId !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Phiếu không thuộc kho bạn làm việc" }, { status: 403 });
    }
    const ktpRoom = instruction.ktpRoom;
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const locked = await tx.repackInstruction.updateMany({
          where: { id, status: "KTP_WAITING_HANDOVER" },
          data: { status: "KTP_HANDED_OVER", ktpHandedOverAt: new Date(), ktpHandedOverById: session.user.id },
        });
        if (locked.count === 0) throw new InsufficientRoomStockError("Phiếu đã được bàn giao");
        await deductFromRoomFifo(tx, ktpRoom.id, instruction.plantTypeId, instruction.inputStageCode, instruction.inputQuantity, `${ktpRoom.name} ${instruction.plantType.code} ${instruction.inputStageCode}`);
        return tx.repackInstruction.findUnique({ where: { id } });
      });
      await createAlertForWarehouseStaff({
        role: "KHO_MO",
        warehouseId: instruction.productionWarehouseId,
        type: "KTP_REPACK_CREATED",
        title: "Kho thành phẩm bàn giao Phiếu xử lý",
        message: `${session.user.name} bàn giao phiếu xử lý ${instruction.code}: ${instruction.inputQuantity.toLocaleString("vi-VN")} cây ${instruction.plantType.name} ${instruction.inputStageCode} — vào Nhận bàn giao liên kho để nhận vào Phòng đợi xử lý.`,
        relatedId: instruction.id,
        relatedType: "RepackInstruction",
      });
      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof InsufficientRoomStockError) return NextResponse.json({ message: err.message }, { status: 409 });
      throw err;
    }
  }

  // ---- Kho mô nhận Phiếu xử lý vào Phòng đợi xử lý (lô gắn thẳng vào phòng, không giàn kệ — giống phòng
  // nhiễm cá nhân) — tạo lô nguồn, chỉ định về "Chờ gán NV" ----
  if ("khoMoReceive" in body) {
    if (role !== "KHO_MO" && !isAdminRole(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    const warehouseId = instruction.productionWarehouseId;
    if (!warehouseId || instruction.status !== "KTP_HANDED_OVER") {
      return NextResponse.json({ message: "Phiếu xử lý không ở trạng thái chờ Kho mô nhận" }, { status: 400 });
    }
    if (role === "KHO_MO" && warehouseId !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Phiếu không thuộc kho bạn làm việc" }, { status: 403 });
    }
    const room = await prisma.room.findFirst({ where: { warehouseId, type: "PHONG_DOI_XU_LY", isActive: true }, select: { id: true } });
    if (!room) return NextResponse.json({ message: "Kho chưa có Phòng đợi xử lý — liên hệ Admin" }, { status: 400 });
    const staff = await prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } });
    const updated = await prisma.$transaction(async (tx) => {
      const locked = await tx.repackInstruction.updateMany({ where: { id, status: "KTP_HANDED_OVER" }, data: { status: "CREATED" } });
      if (locked.count === 0) throw new InsufficientRoomStockError("Phiếu đã được nhận");
      const now = new Date();
      const lot = await tx.lot.create({
        data: {
          code: await generateLotCode({ plantTypeCode: instruction.plantType.code, staffCode: staff?.code ?? "000", stageCode: instruction.inputStageCode, date: now, client: tx }),
          plantTypeId: instruction.plantTypeId,
          stage: "THANH_PHAM",
          stageCode: instruction.inputStageCode,
          roomId: room.id,
          quantity: instruction.inputQuantity,
          initialQuantity: instruction.inputQuantity,
          status: "ACTIVE",
          enteredAt: now,
        },
        select: { id: true },
      });
      return tx.repackInstruction.update({
        where: { id },
        data: { sourceLotId: lot.id, khoMoReceivedAt: now, khoMoReceivedById: session.user.id },
      });
    }).catch((err) => {
      if (err instanceof InsufficientRoomStockError) return null;
      throw err;
    });
    if (!updated) return NextResponse.json({ message: "Phiếu đã được nhận" }, { status: 409 });
    return NextResponse.json(updated);
  }

  // ---- Kho mô bàn giao liên kho lại cho Kho thành phẩm: trừ lô kết quả trong Phòng đợi xử lý ----
  if ("returnToKtp" in body) {
    if (role !== "KHO_MO" && !isAdminRole(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (role === "KHO_MO" && productionWarehouseIdOf(instruction) !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Chỉ định không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (!instruction.ktpRoomId) return NextResponse.json({ message: "Chỉ định này không phải Phiếu xử lý của Kho thành phẩm" }, { status: 400 });
    if (instruction.status !== "WAITING_RETURN_HANDOVER" || !instruction.outputLot) {
      return NextResponse.json({ message: "Cần xếp kết quả về Phòng đợi xử lý trước khi bàn giao lại Kho thành phẩm" }, { status: 400 });
    }
    const outputLot = instruction.outputLot;
    const total = (instruction.confirmedPassedQuantity ?? 0) + (instruction.confirmedFailedQuantity ?? 0);
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const locked = await tx.repackInstruction.updateMany({
          where: { id, status: "WAITING_RETURN_HANDOVER" },
          data: { returnedAt: new Date(), returnedById: session.user.id, status: "PENDING_RETURN" },
        });
        if (locked.count === 0) throw new InsufficientRoomStockError("Phiếu đã được bàn giao lại");
        const lot = await tx.lot.findUnique({ where: { id: outputLot.id }, select: { quantity: true } });
        if (!lot || lot.quantity < total) {
          throw new InsufficientRoomStockError(`Lô ${outputLot.code} trong Phòng đợi xử lý chỉ còn ${lot?.quantity ?? 0}, cần ${total}`);
        }
        await tx.lot.update({ where: { id: outputLot.id }, data: { quantity: { decrement: total } } });
        return tx.repackInstruction.findUnique({ where: { id } });
      });
    } catch (err) {
      if (err instanceof InsufficientRoomStockError) return NextResponse.json({ message: err.message }, { status: 409 });
      throw err;
    }
    for (const targetRole of ["QUAN_LY_KHO_THANH_PHAM", "KHO_THANH_PHAM"] as const) {
      await createAlert({
        type: "KTP_REPACK_RETURNED",
        title: "Phiếu xử lý đã xong — chờ Kho thành phẩm nhận lại",
        message: `${session.user.name} bàn giao lại kết quả phiếu xử lý ${instruction.code} (${instruction.plantType.name} ${instruction.outputStageCode}): ${instruction.confirmedPassedQuantity ?? 0} đạt / ${instruction.confirmedFailedQuantity ?? 0} không đạt — vào Nhận hàng > Nhận lại phiếu xử lý để xác nhận.`,
        targetRole,
        relatedId: instruction.id,
        relatedType: "RepackInstruction",
      });
    }
    return NextResponse.json(updated);
  }

  // ---- Kho thành phẩm xác nhận nhận lại kết quả Phiếu xử lý ----
  if ("ktpReceive" in body) {
    if (role !== "KHO_THANH_PHAM" && role !== "QUAN_LY_KHO_THANH_PHAM" && !isAdminRole(role)) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    if (!instruction.ktpRoom || instruction.status !== "PENDING_RETURN") {
      return NextResponse.json({ message: "Phiếu xử lý không ở trạng thái chờ Kho thành phẩm nhận lại" }, { status: 400 });
    }
    const { passedQuantity, failedQuantity } = body.ktpReceive;
    if (passedQuantity + failedQuantity > instruction.inputQuantity) {
      return NextResponse.json({ message: "Tổng đạt + không đạt vượt quá số lượng đã gửi xử lý" }, { status: 400 });
    }
    const ktpRoom = instruction.ktpRoom;
    const datRoom = await prisma.room.findFirst({
      where: { warehouseId: ktpRoom.warehouseId, type: "PHONG_DAT_TIEU_CHUAN", isActive: true },
      select: { id: true },
    });
    if (!datRoom) return NextResponse.json({ message: "Kho thành phẩm chưa có Phòng đạt tiêu chuẩn" }, { status: 400 });
    const staff = await prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } });
    const staffCode = staff?.code ?? "000";
    const updated = await prisma.$transaction(async (tx) => {
      if (passedQuantity > 0) {
        await upsertLot(tx, datRoom.id, instruction.plantTypeId, instruction.plantType.code, instruction.outputStageCode, passedQuantity, staffCode);
      }
      if (failedQuantity > 0) {
        await upsertLot(tx, ktpRoom.id, instruction.plantTypeId, instruction.plantType.code, instruction.outputStageCode, failedQuantity, staffCode);
      }
      return tx.repackInstruction.update({
        where: { id },
        data: {
          ktpConfirmedAt: new Date(),
          ktpConfirmedById: session.user.id,
          ktpPassedQuantity: passedQuantity,
          ktpFailedQuantity: failedQuantity,
          status: "COMPLETED",
        },
      });
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
}
