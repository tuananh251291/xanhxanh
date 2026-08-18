import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package, Leaf, AlertTriangle, ShoppingCart, Users, Sun, Moon, TrendingUp,
  PackageCheck, PackageOpen, PenLine, Send, CheckCircle2, XCircle, ClipboardList, ClipboardCheck,
  FlaskConical, Bell, Recycle, Eye, RotateCcw, ShieldPlus, LayoutList, Camera, type LucideIcon,
} from "lucide-react";
import { ROLE_LABELS, LOT_STATUS_LABELS, ORDER_STATUS_LABELS, MARKET_LABELS, isAdminRole, isKhoThanhPhamRole, MIN_BACKUP_INSTRUCTION_COUNT, INSPECTION_LANE_LABELS } from "@/types";
import type { UserRole } from "@prisma/client";
import { formatDistanceToNow, startOfDay, endOfDay, startOfWeek, endOfWeek, addDays, addWeeks, format } from "date-fns";
import { vi } from "date-fns/locale";
import TodayChecklist from "@/components/shared/today-checklist";
import { ensureTodayChecklist } from "@/lib/checklist";
import ProductivityLeaderboard from "@/components/shared/productivity-leaderboard";
import { isMediumOrderInProgress, isMediumSurplusEntryDay } from "@/lib/medium-orders";
import { randomGreetingQuote } from "@/lib/greetings";
import { getInspectionDueAt } from "@/lib/inspection";
import { toStoredWeekStart } from "@/lib/week-rotation";

async function getAdminStats() {
  const [totalLots, activeLots, pendingOrders, totalUsers, recentAlerts] = await Promise.all([
    prisma.lot.count(),
    prisma.lot.count({ where: { status: "ACTIVE" } }),
    prisma.order.count({ where: { status: { in: ["HELD", "CONFIRMED"] } } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.alert.findMany({
      where: { status: "UNREAD" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  return { totalLots, activeLots, pendingOrders, totalUsers, recentAlerts };
}

async function getSaleStats(userId: string, workplaceWarehouseId: string | null) {
  // "Tồn đạt tiêu chuẩn" ở đây phải khớp đúng phạm vi trang /inventory/dat-tieu-chuan (Phòng đạt tiêu chuẩn của kho
  // được gán + các Phòng thị trường đã được cấp quyền riêng qua RoomAccess) — không đếm toàn hệ thống.
  const accessibleRooms = await prisma.room.findMany({
    where: {
      OR: [
        ...(workplaceWarehouseId ? [{ warehouseId: workplaceWarehouseId, type: "PHONG_DAT_TIEU_CHUAN" as const }] : []),
        { type: "PHONG_THI_TRUONG" as const, roomAccess: { some: { userId } } },
      ],
    },
    select: { id: true },
  });

  const [myOrders, availableLots] = await Promise.all([
    prisma.order.findMany({
      where: { saleId: userId, status: { in: ["HELD", "CONFIRMED"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    accessibleRooms.length > 0
      ? prisma.lot.count({ where: { status: "ACTIVE", roomId: { in: accessibleRooms.map((r) => r.id) } } })
      : 0,
  ]);
  return { myOrders, availableLots };
}

async function getCayMoStats(userId: string) {
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const [pendingMotherReceipt, dailyRecordToday, uninspectedDarkRoomLots, handoverToday, unreadInspectionResults, weeklyCorrectionCount, staffUser] = await Promise.all([
    // Chỉ tính trên các chỉ định Kho mô đã bàn giao (handedOverAt) — chỉ định "Chưa bàn giao" không
    // tính vào đánh giá vì NV cấy mô chưa có gì để xác nhận.
    prisma.plantingInstruction.findFirst({
      where: { assignedToId: userId, handedOverAt: { not: null }, motherReceivedAt: null },
    }),
    prisma.dailyRecord.findFirst({
      where: { staffId: userId, recordDate: { gte: todayStart, lte: todayEnd } },
    }),
    // "Kiểm tra nhiễm phòng tối" chỉ hoàn thành khi không còn lô nào ở phòng tối cá nhân của NV bị QUÁ
    // HẠN kiểm tra (xem getInspectionDueAt) — lô mới nhập, chưa tới hạn thì không chặn việc này. Cùng
    // phạm vi lô với /api/lots?roomType=PHONG_TOI (xem my-dark-room/page.tsx): gắn thẳng vào Room qua
    // roomId, không qua Shelf.
    prisma.lot.findMany({
      where: {
        status: "ACTIVE",
        instruction: { assignedToId: userId },
        inspectedAt: null,
        room: { type: "PHONG_TOI" },
      },
      select: { enteredAt: true },
    }),
    prisma.transfer.findFirst({
      where: {
        fromUserId: userId,
        fromRoom: { type: "PHONG_TOI" },
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    }),
    // Luồng Đỏ (hoặc chưa cài đặt luồng) — Kho mô vừa kiểm tra xong 1 phiếu bàn giao, chưa xem kết quả.
    // Luồng Xanh không phát sinh loại thông báo này (xem inspect/[transferId]/route.ts).
    prisma.alert.count({
      where: { userId, type: "INSPECTION_RESULT_READY", status: "UNREAD" },
    }),
    // Số lần Admin/Kho mô đã sửa lại nhật ký cấy của chính NV này trong tuần (chỉ tính lần THỰC SỰ đổi
    // số liệu — xem changed ở PATCH /api/daily-records/[id]) — dùng để nhắc nhở NV để ý nhập liệu.
    prisma.dailyRecordEdit.count({
      where: { staffId: userId, createdAt: { gte: weekStart, lte: weekEnd } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { inspectionLane: true } }),
  ]);

  const now = new Date();
  const hasOverdueDarkRoomLot = uninspectedDarkRoomLots.some((lot) => getInspectionDueAt(lot.enteredAt) <= now);

  return {
    motherReceived: !pendingMotherReceipt,
    dailyRecordDone: !!dailyRecordToday,
    contaminationChecked: !hasOverdueDarkRoomLot,
    handoverDone: !!handoverToday,
    unreadInspectionResults,
    weeklyCorrectionCount,
    inspectionLane: staffUser?.inspectionLane ?? null,
  };
}

// Việc 1: tính theo số lô — mẫu mẹ do chính KY_THUAT này phụ trách (qua chỉ định gốc tạo ra lô) đã
// "đủ thời gian đợi cấy chuyển" (expectedMoveAt <= hôm nay), kể cả lô quá hạn từ tuần trước chưa xử lý
// (không giới hạn theo tuần hiện tại) — bấy nhiêu lô phải có mặt trong 1 chỉ định (bất kỳ ai tạo) thì
// mới tính là xong; hạn chót là thứ 5 tuần này.
// Việc 2: khi CAY_MO nhập số liệu lệch quá ngưỡng so với chỉ định, hệ thống đã tự tạo alert
// OUTPUT_DEVIATION cho KY_THUAT (xem /api/daily-records) — KY_THUAT phải vào trang Thông báo chọn
// nguyên nhân (KY_THUAT_SAI/CAY_MO_SAI) để xử lý. % = số alert lệch trong tuần đã chọn nguyên nhân /
// tổng số alert lệch phát sinh trong tuần, tính trên các chỉ định do chính người này tạo.
async function getKyThuatStats(userId: string) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const thursdayDeadline = addDays(weekStart, 3);

  const myInstructions = await prisma.plantingInstruction.findMany({
    where: { createdById: userId },
    select: { id: true },
  });
  const myInstructionIds = myInstructions.map((i) => i.id);

  const [dueMotherLots, deviationAlerts] = await Promise.all([
    prisma.lot.findMany({
      where: {
        stage: "MAU_ME",
        status: "ACTIVE",
        expectedMoveAt: { lte: now },
        instruction: { createdById: userId },
      },
      select: { id: true },
    }),
    myInstructionIds.length === 0
      ? Promise.resolve([])
      : prisma.alert.findMany({
          where: {
            type: "OUTPUT_DEVIATION",
            relatedType: "PlantingInstruction",
            relatedId: { in: myInstructionIds },
            createdAt: { gte: weekStart, lte: weekEnd },
          },
          select: { cause: true },
        }),
  ]);
  const dueLotIds = dueMotherLots.map((l) => l.id);

  const handledItems = dueLotIds.length === 0
    ? []
    : await prisma.plantingInstructionItem.findMany({
        where: { lotId: { in: dueLotIds } },
        distinct: ["lotId"],
        select: { lotId: true },
      });

  const instructionPercent = dueLotIds.length === 0 ? 100 : Math.round((handledItems.length / dueLotIds.length) * 100);
  const resolvedDeviations = deviationAlerts.filter((a) => a.cause !== null).length;
  const checkPercent = deviationAlerts.length === 0 ? 100 : Math.round((resolvedDeviations / deviationAlerts.length) * 100);

  // Việc "3. Tạo chỉ định cấy dự phòng" — tối thiểu MIN_BACKUP_INSTRUCTION_COUNT chỉ định isBackup cho
  // ĐÚNG tuần sau (weekStart = nextWeekStart), tạo trước Thứ 5 tuần này — xem /instructions/backup. Đếm
  // theo weekStart chính xác nên tự "reset" mỗi tuần (tuần sau trở thành tuần này thì không còn tính vào
  // chỉ tiêu mới). toStoredWeekStart để so khớp đúng giờ UTC-midnight đã lưu, không theo giờ local server.
  const backupCount = await prisma.plantingInstruction.count({
    where: { createdById: userId, isBackup: true, weekStart: toStoredWeekStart(addWeeks(weekStart, 1)) },
  });
  const backupPercent = Math.min(100, Math.round((backupCount / MIN_BACKUP_INSTRUCTION_COUNT) * 100));

  // Việc "4. Cập nhật hình ảnh định kì" — hạn chót mềm Thứ 3 (khác Thứ 5 của việc 1/3), tính live từ
  // MotherPhoto (không có bảng "nhiệm vụ" riêng — xem prisma/schema.prisma). % = số loại cây NV này đã
  // chụp tuần này / tổng số loại cây đang có lô mẫu mẹ ACTIVE hệ thống.
  const tuesdayDeadline = endOfDay(addDays(weekStart, 1));
  const [activeMotherPlantTypes, motherPhotosThisWeek] = await Promise.all([
    prisma.lot.findMany({
      // Chỉ tính giàn ĐÃ GẮN cho nhân sự — không cần cập nhật ảnh cho lô ở "kệ chung".
      where: { stage: "MAU_ME", status: "ACTIVE", quantity: { gt: 0 }, shelf: { assignedStaffId: { not: null } } },
      distinct: ["plantTypeId"],
      select: { plantTypeId: true },
    }),
    prisma.motherPhoto.findMany({
      where: { takenById: userId, weekStart: toStoredWeekStart(weekStart) },
      select: { plantTypeId: true, createdAt: true },
    }),
  ]);
  const motherPhotoTotal = activeMotherPlantTypes.length;
  const motherPhotoDistinctPlantTypes = new Set(motherPhotosThisWeek.map((p) => p.plantTypeId));
  const motherPhotoDone = motherPhotoTotal === 0 ? true : motherPhotoDistinctPlantTypes.size >= motherPhotoTotal;
  const motherPhotoPercent = motherPhotoTotal === 0 ? 100 : Math.round((motherPhotoDistinctPlantTypes.size / motherPhotoTotal) * 100);

  return {
    weekStart, weekEnd, thursdayDeadline, instructionPercent, checkPercent,
    instructionDone: handledItems.length,
    instructionTotal: dueLotIds.length,
    backupCount, backupPercent,
    tuesdayDeadline, motherPhotoPercent, motherPhotoDone,
    motherPhotoDoneCount: motherPhotoDistinctPlantTypes.size, motherPhotoTotal,
  };
}

// Việc "Giao mẫu mẹ theo chỉ định cấy": chỉ định cấy do KY_THUAT tạo trước Thứ 5 tuần này phải được
// Kho mô bàn giao (handedOverAt) cho NV cấy mô trước Thứ 2 tuần sau. Việc chung của cả phòng kho mô
// (không phân theo người tạo/người bàn giao) — tính cộng dồn, kể cả chỉ định quá hạn từ tuần trước
// chưa xử lý (không giới hạn theo tuần hiện tại), giống cách tính việc "Tạo chỉ định cấy" của Kỹ thuật.
// NV kho mô chỉ làm việc 1 kho sản xuất (nếu đã được gán địa điểm làm việc) — công việc chỉ tính trên
// chỉ định thuộc đúng kho đó.
// Các công việc "hàng tuần" khác (bàn giao thành phẩm/nhận môi trường/đề xuất nhiễm) không có hạn chót
// cố định như việc 1 — tạm tính % theo tỉ lệ đã xử lý/tổng phát sinh trong tuần (hoặc lượng tồn còn lại
// với Phòng nhiễm), có thể cần NV nghiệp vụ mô tả rõ hơn để điều chỉnh sau.
async function getKhoMoWeeklyStats(workplaceWarehouseId: string | null) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const thursdayDeadline = addDays(weekStart, 3);
  const nextMondayDeadline = addWeeks(weekStart, 1);

  const [dueInstructions, finishedTransfers, mediumDays, contaminationLots] = await Promise.all([
    prisma.plantingInstruction.findMany({
      where: {
        createdAt: { lte: thursdayDeadline },
        // Chỉ định đã bị KY_THUAT hủy không còn là việc "phải bàn giao" nữa — không tính vào tổng, tránh
        // kéo % hoàn thành xuống oan (handedOverAt sẽ mãi không có vì đã hủy trước khi bàn giao).
        status: { not: "CANCELLED" },
        ...(workplaceWarehouseId ? { items: { some: { shelf: { warehouseId: workplaceWarehouseId } } } } : {}),
      },
      select: { handedOverAt: true },
    }),
    // Bàn giao thành phẩm: phiếu Transfer từ Phòng ra rễ tạo trong tuần này — Kho thành phẩm xác nhận
    // (CONFIRMED) coi là xong.
    prisma.transfer.findMany({
      where: {
        fromRoom: { type: "PHONG_RA_RE", ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}) },
        createdAt: { gte: weekStart, lte: weekEnd },
      },
      select: { status: true },
    }),
    // Nhận môi trường: ngày môi trường đã được NV môi trường bàn giao (handedOverAt) trong tuần này —
    // Kho mô xác nhận (confirmedAt) coi là xong.
    prisma.mediumOrderDay.findMany({
      where: {
        date: { gte: weekStart, lte: weekEnd },
        handedOverAt: { not: null },
        ...(workplaceWarehouseId
          ? { order: { instructions: { some: { items: { some: { shelf: { warehouseId: workplaceWarehouseId } } } } } } }
          : {}),
      },
      select: { confirmedAt: true },
    }),
    // Đề xuất Trồng/Hủy: lô còn tồn trong Phòng nhiễm của kho này — hết tồn nghĩa là đã gửi đề xuất xử lý
    // hết (xem lib/contamination-room.ts — số lượng bị trừ ngay khỏi Phòng nhiễm lúc gửi đề xuất).
    prisma.lot.findMany({
      where: {
        status: "ACTIVE",
        room: { type: "PHONG_NHIEM", ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}) },
      },
      select: { quantity: true },
    }),
  ]);

  const handoverTotal = dueInstructions.length;
  const handoverDone = dueInstructions.filter((i) => i.handedOverAt !== null).length;
  const handoverPercent = handoverTotal === 0 ? 100 : Math.round((handoverDone / handoverTotal) * 100);

  const finishedTotal = finishedTransfers.length;
  const finishedDone = finishedTransfers.filter((t) => t.status === "CONFIRMED").length;
  const finishedPercent = finishedTotal === 0 ? 100 : Math.round((finishedDone / finishedTotal) * 100);

  const mediumTotal = mediumDays.length;
  const mediumDone = mediumDays.filter((d) => d.confirmedAt !== null).length;
  const mediumPercent = mediumTotal === 0 ? 100 : Math.round((mediumDone / mediumTotal) * 100);

  const contaminationOutstanding = contaminationLots.reduce((sum, l) => sum + l.quantity, 0);
  const contaminationPercent = contaminationOutstanding === 0 ? 100 : 0;

  return {
    weekStart, weekEnd, nextMondayDeadline,
    handoverDone, handoverTotal, handoverPercent,
    finishedDone, finishedTotal, finishedPercent,
    mediumDone, mediumTotal, mediumPercent,
    contaminationOutstanding, contaminationPercent,
  };
}

// Việc "hàng ngày" của Kho mô: xác nhận các phiếu bàn giao từ Phòng tối cá nhân (NV cấy mô gửi lên) được
// tạo trong ngày — cùng phạm vi lọc phiếu với GET /api/transfers cho KHO_MO (toUserId null + đúng kho).
async function getKhoMoDailyStats(workplaceWarehouseId: string | null, userId: string) {
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const transfersToday = await prisma.transfer.findMany({
    where: {
      toUserId: null,
      fromRoom: { type: "PHONG_TOI", ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}) },
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    select: { status: true },
  });

  const receiveTotal = transfersToday.length;
  const receiveDone = transfersToday.filter((t) => t.status === "CONFIRMED").length;
  const receivePercent = receiveTotal === 0 ? 100 : Math.round((receiveDone / receiveTotal) * 100);

  // Kiểm tra môi trường dư: chỉ hiện việc này đúng Thứ 2/Thứ 3 (xem isMediumSurplusEntryDay), và chỉ khi có
  // đơn "đang thực hiện" (đã xác nhận, chưa kết thúc) của đúng kho này còn CHƯA bấm "Hoàn thành"
  // (surplusRecordedAt null) — biến mất khỏi cả 2 ngày ngay khi đã hoàn thành, không đợi hết Thứ 3.
  let mediumSurplusOrderId: string | null = null;
  if (isMediumSurplusEntryDay()) {
    const candidateOrders = await prisma.mediumOrder.findMany({
      where: {
        confirmedAt: { not: null },
        surplusRecordedAt: null,
        ...(workplaceWarehouseId ? { instructions: { some: { items: { some: { shelf: { warehouseId: workplaceWarehouseId } } } } } } : {}),
      },
      include: { days: { select: { handedOverAt: true, confirmedAt: true } } },
    });
    mediumSurplusOrderId = candidateOrders.find((o) => isMediumOrderInProgress(o))?.id ?? null;
  }

  // "Kiểm tra kho tối" — 2 nhiệm vụ nhỏ (Kiểm tra kho cá nhân + Kiểm tra kho nhiễm cá nhân), xem
  // src/lib/checklist.ts (ensureTodayChecklist sinh ChecklistItem kind=DARK_ROOM_CHECK từ template Admin
  // soạn trong Settings) và /dark-room-check (trang thao tác 2 nhiệm vụ nhỏ này).
  await ensureTodayChecklist(userId, "KHO_MO");
  const darkRoomCheckItem = await prisma.checklistItem.findFirst({
    where: { userId, kind: "DARK_ROOM_CHECK", completed: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, subTask1Done: true, subTask2Done: true },
  });
  const darkRoomSubTasksDone = darkRoomCheckItem ? Number(darkRoomCheckItem.subTask1Done) + Number(darkRoomCheckItem.subTask2Done) : 2;
  const darkRoomCheckPercent = Math.round((darkRoomSubTasksDone / 2) * 100);

  return { receiveDone, receiveTotal, receivePercent, mediumSurplusOrderId, darkRoomCheckItemId: darkRoomCheckItem?.id ?? null, darkRoomCheckPercent, darkRoomSubTasksDone };
}

// Đơn "đang xử lý" của NV môi trường = đơn do chính họ xác nhận, chưa kết thúc (xem
// isMediumOrderInProgress) — dùng để hiện thẳng lên dashboard, giống trang "Bàn giao môi trường".
async function getMoiTruongStats(userId: string, workplaceWarehouseId: string | null) {
  const [myOrders, pendingOrders] = await Promise.all([
    prisma.mediumOrder.findMany({
      where: { confirmedById: userId, confirmedAt: { not: null } },
      include: { days: { select: { handedOverAt: true, confirmedAt: true } } },
      orderBy: { confirmedAt: "desc" },
    }),
    prisma.mediumOrder.count({
      where: {
        confirmedAt: null,
        ...(workplaceWarehouseId ? { instructions: { some: { items: { some: { shelf: { warehouseId: workplaceWarehouseId } } } } } } : {}),
      },
    }),
  ]);
  const activeOrder = myOrders.find((o) => isMediumOrderInProgress(o)) ?? null;
  return { activeOrder, pendingOrders };
}

async function getKhoMoStats() {
  const [pendingTransfers, activeLots] = await Promise.all([
    prisma.transfer.count({ where: { status: "PENDING" } }),
    prisma.lot.groupBy({
      by: ["stage"],
      where: { status: "ACTIVE" },
      _count: true,
      _sum: { quantity: true },
    }),
  ]);
  return { pendingTransfers, activeLots };
}

// Công việc hàng ngày của Kho thành phẩm — 3 việc lặp lại mỗi ngày, tính theo số lượng đang chờ xử lý
// (không có khái niệm "hoàn thành %" như KY_THUAT/KHO_MO vì đây là hàng đợi liên tục, không có deadline
// cố định trong ngày).
async function getKhoThanhPhamDailyStats() {
  const [packOrdersCount, hanTuiLots, processingPendingCount] = await Promise.all([
    prisma.order.count({ where: { status: "CONFIRMED" } }),
    prisma.lot.findMany({
      where: { status: "ACTIVE", room: { type: "PHONG_HAN_TUI" } },
      select: { quantity: true },
    }),
    prisma.orderProcessingRequest.count({ where: { status: "PENDING" } }),
  ]);
  return {
    packOrdersCount,
    hanTuiQuantity: hanTuiLots.reduce((s, l) => s + l.quantity, 0),
    processingPendingCount,
  };
}

// Công việc hàng tuần của Kho thành phẩm. "Đề xuất Trồng/Hủy" và "Trả hàng nhà cung cấp" chưa có trang
// nghiệp vụ riêng cho Kho thành phẩm (xem TODO.md) — tạm hiện dạng "Sắp ra mắt", không có href.
async function getKhoThanhPhamWeeklyStats() {
  const [contaminationPendingCount, theoDoiLots] = await Promise.all([
    prisma.contaminationRecord.count({ where: { confirmedAt: null, lot: { stage: "THANH_PHAM" } } }),
    prisma.lot.findMany({
      where: { status: "ACTIVE", room: { type: "PHONG_THEO_DOI" } },
      select: { quantity: true },
    }),
  ]);
  return {
    contaminationPendingCount,
    theoDoiQuantity: theoDoiLots.reduce((s, l) => s + l.quantity, 0),
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role as UserRole;
  const userId = session?.user?.id ?? "";

  if (isAdminRole(role)) {
    const stats = await getAdminStats();
    return <AdminDashboard stats={stats} />;
  }

  if (role === "SALE") {
    const stats = await getSaleStats(userId, session?.user?.workplaceWarehouseId ?? null);
    return <SaleDashboard stats={stats} userName={session?.user?.name ?? ""} />;
  }

  if (role === "KHO_MO") {
    const workplaceWarehouseId = session?.user?.workplaceWarehouseId ?? null;
    const [weeklyStats, dailyStats] = await Promise.all([
      getKhoMoWeeklyStats(workplaceWarehouseId),
      getKhoMoDailyStats(workplaceWarehouseId, userId),
    ]);
    return <KhoMoTaskDashboard weeklyStats={weeklyStats} dailyStats={dailyStats} userName={session?.user?.name ?? ""} />;
  }

  if (isKhoThanhPhamRole(role)) {
    const [stats, dailyStats, weeklyStats] = await Promise.all([
      getKhoMoStats(),
      getKhoThanhPhamDailyStats(),
      getKhoThanhPhamWeeklyStats(),
    ]);
    return <KhoDashboard stats={stats} dailyStats={dailyStats} weeklyStats={weeklyStats} role={role} />;
  }

  if (role === "CAY_MO") {
    const stats = await getCayMoStats(userId);
    return <CayMoDashboard stats={stats} userName={session?.user?.name ?? ""} />;
  }

  if (role === "KY_THUAT") {
    const stats = await getKyThuatStats(userId);
    return <KyThuatDashboard stats={stats} userName={session?.user?.name ?? ""} />;
  }

  if (role === "MOI_TRUONG") {
    const stats = await getMoiTruongStats(userId, session?.user?.workplaceWarehouseId ?? null);
    return <MoiTruongDashboard stats={stats} userName={session?.user?.name ?? ""} />;
  }

  return <DefaultDashboard role={role} userName={session?.user?.name ?? ""} />;
}

function GreetingBanner() {
  return (
    <p className="text-sm font-bold text-primary-strong bg-primary-light border border-primary-light rounded-lg px-3 py-2">
      {randomGreetingQuote()}
    </p>
  );
}

function AdminDashboard({ stats }: { stats: Awaited<ReturnType<typeof getAdminStats>> }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard tổng quan</h1>
        <p className="text-text-secondary text-sm mt-1">Quản trị hệ thống</p>
      </div>
      <GreetingBanner />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Lô cây đang lưu" value={stats.activeLots} icon={Leaf} color="green" />
        <StatCard title="Tổng lô cây" value={stats.totalLots} icon={Package} color="blue" />
        <StatCard title="Đơn đang xử lý" value={stats.pendingOrders} icon={ShoppingCart} color="yellow" />
        <StatCard title="Nhân viên" value={stats.totalUsers} icon={Users} color="purple" />
      </div>
      <TodayChecklist />
      {stats.recentAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning-foreground" />
              Cảnh báo chưa đọc ({stats.recentAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start justify-between p-3 bg-warning-light rounded-lg border border-warning-light">
                  <div>
                    <p className="text-sm font-medium text-foreground">{alert.title}</p>
                    <p className="text-xs text-text-secondary whitespace-pre-line">{alert.message}</p>
                  </div>
                  <span className="text-xs text-text-muted whitespace-nowrap ml-4">
                    {formatDistanceToNow(alert.createdAt, { addSuffix: true, locale: vi })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SaleDashboard({ stats, userName }: { stats: Awaited<ReturnType<typeof getSaleStats>>; userName: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
        <p className="text-text-secondary text-sm mt-1">{ROLE_LABELS.SALE}</p>
      </div>
      <GreetingBanner />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard title="Tồn đạt tiêu chuẩn (TP)" value={stats.availableLots} icon={Package} color="green" subtitle="lô thành phẩm" />
        <StatCard title="Đơn đang hoạt động" value={stats.myOrders.length} icon={ShoppingCart} color="blue" />
      </div>
      <TodayChecklist />
      {stats.myOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Đơn hàng gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.myOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-background rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{order.code}</p>
                    <p className="text-xs text-text-secondary">{order.customerCode} · {MARKET_LABELS[order.market]}</p>
                  </div>
                  <Badge variant={order.status === "HELD" ? "secondary" : "default"}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CayMoDashboard({
  stats, userName,
}: {
  stats: Awaited<ReturnType<typeof getCayMoStats>>;
  userName: string;
}) {
  const today = format(new Date(), "EEEE, dd/MM/yyyy", { locale: vi });
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
          <p className="text-text-secondary text-sm mt-1 capitalize">Nhân viên nuôi cấy mô · {today}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Link
            href="/dashboard-basic"
            className="flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline"
          >
            <LayoutList className="w-4 h-4" />
            Giao diện cơ bản
          </Link>
          {stats.inspectionLane && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <span
                className={`w-2.5 h-2.5 rounded-full ${stats.inspectionLane === "XANH" ? "bg-success" : "bg-destructive"}`}
              />
              Bạn thuộc luồng {INSPECTION_LANE_LABELS[stats.inspectionLane]}
            </div>
          )}
        </div>
      </div>
      <GreetingBanner />

      {stats.unreadInspectionResults > 0 && (
        <Link href="/handover-record" className="block">
          <Card className="border border-warning bg-warning-light">
            <CardContent className="py-4 flex items-center gap-3">
              <Bell className="w-5 h-5 text-warning-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-warning-foreground">
                  Có {stats.unreadInspectionResults} phiếu bàn giao đã có kết quả kiểm tra
                </p>
                <p className="text-xs text-warning-foreground/80">Bấm để xem số lượng được ghi nhận</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {stats.weeklyCorrectionCount > 0 && (
        <Card className="border border-destructive bg-danger-light">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive">
                Bạn đã nhập sai dữ liệu {stats.weeklyCorrectionCount} lần trong tuần này
              </p>
              <p className="text-xs text-destructive/80">Hãy lưu ý khi nhập liệu — Admin/Kho mô đã phải sửa lại nhật ký cấy của bạn</p>
            </div>
          </CardContent>
        </Card>
      )}

      <ProductivityLeaderboard />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Công việc hôm nay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {cayMoTasks(stats).map((task, i) => (
            <TaskRow key={task.key} href={task.href} icon={task.icon} title={`${i + 1}. ${task.title}`} description={task.description} done={task.done} />
          ))}
        </CardContent>
      </Card>

      <TodayChecklist />
    </div>
  );
}

// "Nhận bàn giao mẫu mẹ" chỉ bật lại (Chưa hoàn thành) khi có chỉ định MỚI được bàn giao — không tự
// reset theo ngày như 3 việc còn lại (xem getCayMoStats) — nên sau khi xác nhận xong, ẩn hẳn khỏi danh
// sách thay vì hiện badge "Đã hoàn thành" cả tuần, tránh nhầm là việc cần làm lại mỗi ngày. 3 việc còn
// lại vẫn hiện kèm badge như cũ vì chúng tự reset "Chưa hoàn thành" vào ngày hôm sau.
function cayMoTasks(stats: Awaited<ReturnType<typeof getCayMoStats>>) {
  return [
    {
      key: "mother",
      href: "/my-instructions",
      icon: PackageCheck,
      title: "Nhận bàn giao mẫu mẹ",
      description: "Xác nhận đã nhận mẫu mẹ từ Kho mô",
      done: stats.motherReceived,
      hideWhenDone: true,
    },
    {
      key: "daily-record",
      href: "/daily-record",
      icon: PenLine,
      title: "Cập nhật số liệu cấy",
      description: "Nhập nhật ký cấy mô trong ngày",
      done: stats.dailyRecordDone,
    },
    {
      key: "dark-room",
      href: "/my-dark-room",
      icon: Moon,
      title: "Kiểm tra nhiễm phòng tối",
      description: "Kiểm tra và báo cáo nhiễm các lô trong phòng tối",
      done: stats.contaminationChecked,
    },
    {
      key: "handover",
      href: "/product-handover",
      icon: Send,
      title: "Bàn giao sản phẩm",
      description: "Bàn giao lô từ phòng tối cho Kho mô",
      done: stats.handoverDone,
    },
  ].filter((task) => !(task.hideWhenDone && task.done));
}

function TaskRow({
  href, icon: Icon, title, description, done,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  done: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-primary-light transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2.5 rounded-xl shrink-0 ${done ? "bg-primary-light text-primary-strong" : "bg-danger-light text-destructive"}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          <p className="text-xs text-text-secondary truncate">{description}</p>
        </div>
      </div>
      <Badge
        className={`shrink-0 gap-1 ${done ? "bg-primary-light text-primary-strong hover:bg-primary-light" : "bg-danger-light text-destructive hover:bg-danger-light"}`}
      >
        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {done ? "Đã hoàn thành" : "Chưa hoàn thành"}
      </Badge>
    </Link>
  );
}

function KyThuatDashboard({
  stats, userName,
}: {
  stats: Awaited<ReturnType<typeof getKyThuatStats>>;
  userName: string;
}) {
  const weekLabel = `${format(stats.weekStart, "dd/MM", { locale: vi })} — ${format(stats.weekEnd, "dd/MM/yyyy", { locale: vi })}`;
  // "Việc 1: Tạo chỉ định cấy" có hạn chót mềm (Thứ 5) khác việc 2 (chỉ có hạn cuối tuần) — 3 trạng thái:
  // xong trong/trước Thứ 5 = "Hoàn thành" (đúng hạn), xong sau Thứ 5 nhưng trước hết Chủ nhật = "Kết
  // thúc" (trễ hạn nhưng vẫn trong tuần), qua hết Thứ 5 mà CHƯA xong = "Cần hoàn thành ngay" (cảnh báo
  // khẩn). Đánh giá lại LIVE mỗi lần tải trang theo đúng thời điểm hiện tại — không lưu mốc "đã hoàn
  // thành lúc nào", nên nếu có lô mới phát sinh quá hạn sau khi đã 100% thì trạng thái tự lùi lại đúng.
  const isPastThursdayEnd = new Date() > endOfDay(stats.thursdayDeadline);
  const instructionDone = stats.instructionPercent >= 100;
  const instructionBadgeState: TaskBadgeState = instructionDone
    ? (isPastThursdayEnd ? "done_late" : "done")
    : (isPastThursdayEnd ? "urgent" : "not_done");
  // "Việc 3: Tạo chỉ định cấy dự phòng" dùng CHUNG hạn chót mềm Thứ 5 với việc 1, cùng 3 trạng thái
  // done/done_late/urgent — đủ MIN_BACKUP_INSTRUCTION_COUNT chỉ định trước/trong Thứ 5 = đúng hạn, đủ sau
  // Thứ 5 (tạo bù) = trễ hạn nhưng vẫn tính hoàn thành, qua Thứ 5 mà chưa đủ = cảnh báo khẩn.
  const backupDone = stats.backupCount >= MIN_BACKUP_INSTRUCTION_COUNT;
  const backupBadgeState: TaskBadgeState = backupDone
    ? (isPastThursdayEnd ? "done_late" : "done")
    : (isPastThursdayEnd ? "urgent" : "not_done");
  // "Việc 4: Cập nhật hình ảnh định kì" — hạn chót mềm riêng (Thứ 3, khác Thứ 5 của việc 1/3). Khác 3
  // việc kia: ẩn HẲN dòng này khi đã xong (không hiện badge "Đã hoàn thành") — xong Thứ 2 thì Thứ 3
  // không cần nhắc lại nữa, xem plan "Cập nhật hình ảnh định kì".
  const isPastTuesdayEnd = new Date() > stats.tuesdayDeadline;
  const motherPhotoBadgeState: TaskBadgeState = isPastTuesdayEnd ? "urgent" : "not_done";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
        <p className="text-text-secondary text-sm mt-1">Nhân viên kỹ thuật · Tuần {weekLabel}</p>
      </div>
      <GreetingBanner />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Công việc trong tuần</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <WeeklyTaskRow
            href="/instructions"
            icon={ClipboardList}
            title="1. Tạo chỉ định cấy"
            deadline={`Cần hoàn thiện trong ngày Thứ 5 hàng tuần (${format(stats.thursdayDeadline, "dd/MM", { locale: vi })})`}
            percent={stats.instructionPercent}
            countLabel={`${stats.instructionDone}/${stats.instructionTotal} lô`}
            badgeState={instructionBadgeState}
          />
          <WeeklyTaskRow
            href="/planting-check"
            icon={ClipboardCheck}
            title="2. Kiểm tra tình trạng cấy"
            deadline="Xử lý các chỉ định lệch % vượt ngưỡng — cần hoàn thiện trong tuần"
            percent={stats.checkPercent}
          />
          <WeeklyTaskRow
            href="/instructions/backup"
            icon={ShieldPlus}
            title="3. Tạo chỉ định cấy dự phòng"
            deadline={`Tối thiểu ${MIN_BACKUP_INSTRUCTION_COUNT} chỉ định cho tuần sau — cần hoàn thiện trong ngày Thứ 5 hàng tuần (${format(stats.thursdayDeadline, "dd/MM", { locale: vi })})`}
            percent={stats.backupPercent}
            countLabel={`${stats.backupCount}/${MIN_BACKUP_INSTRUCTION_COUNT} chỉ định`}
            badgeState={backupBadgeState}
          />
          {!stats.motherPhotoDone && (
            <WeeklyTaskRow
              href="/mother-photo-update"
              icon={Camera}
              title="4. Cập nhật hình ảnh định kì"
              deadline={`Chụp ảnh mẫu mẹ mọi loại cây — cần hoàn thiện trong ngày Thứ 3 hàng tuần (${format(addDays(stats.weekStart, 1), "dd/MM", { locale: vi })})`}
              percent={stats.motherPhotoPercent}
              countLabel={`${stats.motherPhotoDoneCount}/${stats.motherPhotoTotal} loại cây`}
              badgeState={motherPhotoBadgeState}
            />
          )}
        </CardContent>
      </Card>

      <TodayChecklist />
    </div>
  );
}

// "done"/"not_done" = hành vi mặc định cũ (đúng-hạn/chưa xong, dùng cho mọi WeeklyTaskRow không truyền
// badgeState riêng). "done_late" = xong nhưng sau hạn chót mềm (VD Thứ 5) — vẫn coi là đã xử lý xong,
// chỉ khác màu để phân biệt "đúng hạn" và "trễ hạn nhưng vẫn trong tuần". "urgent" = đã qua hạn chót mềm
// mà vẫn chưa xong — cảnh báo khẩn, khác với "not_done" (chưa tới hạn, vẫn còn thời gian).
type TaskBadgeState = "done" | "not_done" | "done_late" | "urgent";

const TASK_BADGE_CONFIG: Record<TaskBadgeState, {
  chipClass: string; badgeClass: string; icon: LucideIcon; barClass: string; label: string;
}> = {
  done: {
    chipClass: "bg-primary-light text-primary-strong", badgeClass: "bg-primary-light text-primary-strong hover:bg-primary-light",
    icon: CheckCircle2, barClass: "bg-primary", label: "Đã hoàn thành",
  },
  done_late: {
    chipClass: "bg-warning-light text-warning-foreground", badgeClass: "bg-warning-light text-warning-foreground hover:bg-warning-light",
    icon: CheckCircle2, barClass: "bg-warning", label: "Đã kết thúc (trễ hạn)",
  },
  urgent: {
    chipClass: "bg-danger-light text-destructive", badgeClass: "bg-danger-light text-destructive hover:bg-danger-light",
    icon: AlertTriangle, barClass: "bg-destructive", label: "Cần hoàn thành ngay",
  },
  not_done: {
    chipClass: "bg-danger-light text-destructive", badgeClass: "bg-danger-light text-destructive hover:bg-danger-light",
    icon: XCircle, barClass: "bg-destructive", label: "Chưa hoàn thành",
  },
};

function WeeklyTaskRow({
  href, icon: Icon, title, deadline, percent, countLabel, badgeState,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  deadline: string;
  percent: number;
  countLabel?: string;
  badgeState?: TaskBadgeState;
}) {
  const state = badgeState ?? (percent >= 100 ? "done" : "not_done");
  const config = TASK_BADGE_CONFIG[state];
  const BadgeIcon = config.icon;
  return (
    <Link
      href={href}
      className="block p-3 rounded-lg border border-border hover:bg-primary-light transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2.5 rounded-xl shrink-0 ${config.chipClass}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{title}</p>
            <p className="text-xs text-text-secondary truncate">{deadline}</p>
          </div>
        </div>
        <Badge className={`shrink-0 gap-1 ${config.badgeClass}`}>
          <BadgeIcon className="w-3.5 h-3.5" />
          {`${config.label} — ${countLabel ?? `${percent}%`}`}
        </Badge>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 mt-3">
        <div
          className={`rounded-full h-1.5 ${config.barClass}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </Link>
  );
}

function KhoMoTaskDashboard({
  weeklyStats, dailyStats, userName,
}: {
  weeklyStats: Awaited<ReturnType<typeof getKhoMoWeeklyStats>>;
  dailyStats: Awaited<ReturnType<typeof getKhoMoDailyStats>>;
  userName: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
        <p className="text-text-secondary text-sm mt-1">Nhân viên kho mô</p>
      </div>
      <GreetingBanner />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Công việc hàng ngày</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <WeeklyTaskRow
            href="/transfers/receive-phong-toi"
            icon={PackageCheck}
            title="1. Nhận bàn giao từ kho tối"
            deadline="Xác nhận các phiếu bàn giao từ phòng tối cá nhân gửi lên trong ngày"
            percent={dailyStats.receivePercent}
            countLabel={`${dailyStats.receiveDone}/${dailyStats.receiveTotal} phiếu`}
          />
          {dailyStats.mediumSurplusOrderId && (
            <WeeklyTaskRow
              href={`/medium-orders/${dailyStats.mediumSurplusOrderId}`}
              icon={FlaskConical}
              title="2. Kiểm tra môi trường dư"
              deadline="Đối chiếu số dư lý thuyết với số đếm thực tế (chỉ Thứ 2, Thứ 3)"
              percent={0}
              countLabel="Chưa nhập"
            />
          )}
          {dailyStats.darkRoomCheckItemId && (
            <WeeklyTaskRow
              href="/dark-room-check"
              icon={Moon}
              title="3. Kiểm tra kho tối"
              deadline="Kiểm tra kho cá nhân NV cấy mô + xác nhận đã chuyển cây nhiễm cá nhân về kho nhiễm chung"
              percent={dailyStats.darkRoomCheckPercent}
              countLabel={`${dailyStats.darkRoomSubTasksDone}/2 nhiệm vụ`}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Công việc hàng tuần</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <WeeklyTaskRow
            href="/instructions"
            icon={Send}
            title="1. Giao mẫu mẹ theo chỉ định cấy"
            deadline={`Chỉ định tạo trước Thứ 5 tuần này cần bàn giao trước Thứ 2 tuần sau (${format(weeklyStats.nextMondayDeadline, "dd/MM", { locale: vi })})`}
            percent={weeklyStats.handoverPercent}
            countLabel={`${weeklyStats.handoverDone}/${weeklyStats.handoverTotal} chỉ định`}
          />
          <WeeklyTaskRow
            href="/transfers/finished"
            icon={Package}
            title="2. Bàn giao thành phẩm"
            deadline="Xác nhận Kho thành phẩm đã nhận các phiếu bàn giao từ Phòng ra rễ trong tuần"
            percent={weeklyStats.finishedPercent}
            countLabel={`${weeklyStats.finishedDone}/${weeklyStats.finishedTotal} phiếu`}
          />
          <WeeklyTaskRow
            href="/medium-orders/receive"
            icon={FlaskConical}
            title="3. Nhận môi trường"
            deadline="Xác nhận các ngày môi trường đã được NV môi trường bàn giao trong tuần"
            percent={weeklyStats.mediumPercent}
            countLabel={`${weeklyStats.mediumDone}/${weeklyStats.mediumTotal} ngày`}
          />
          <WeeklyTaskRow
            href="/contamination-proposals"
            icon={AlertTriangle}
            title="4. Đề xuất Trồng/Hủy"
            deadline="Gửi đề xuất xử lý hết số lượng đang tồn trong Phòng nhiễm"
            percent={weeklyStats.contaminationPercent}
            countLabel={
              weeklyStats.contaminationOutstanding === 0
                ? "Đã xử lý hết"
                : `${weeklyStats.contaminationOutstanding.toLocaleString("vi-VN")} còn tồn`
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MoiTruongDashboard({
  stats, userName,
}: {
  stats: Awaited<ReturnType<typeof getMoiTruongStats>>;
  userName: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
        <p className="text-text-secondary text-sm mt-1">Nhân viên môi trường</p>
      </div>
      <GreetingBanner />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bàn giao môi trường</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.activeOrder ? (
            <Link
              href={`/medium-orders/${stats.activeOrder.id}`}
              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-primary-light transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl shrink-0 bg-warning-light text-warning-foreground">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate font-mono">{stats.activeOrder.code}</p>
                  <p className="text-xs text-text-secondary truncate">Đơn đang xử lý — bấm để xem chi tiết và bàn giao</p>
                </div>
              </div>
              <Badge className="bg-warning-light text-warning-foreground shrink-0">Đang thực hiện</Badge>
            </Link>
          ) : (
            <div className="text-center py-6 text-text-secondary">
              <FlaskConical className="w-8 h-8 mx-auto mb-2 text-text-muted" />
              <p className="text-sm">Không có đơn sản xuất môi trường nào đang xử lý</p>
            </div>
          )}
          {stats.pendingOrders > 0 && (
            <p className="text-xs text-text-muted mt-3">
              Có {stats.pendingOrders} đơn đang chờ xác nhận —{" "}
              <Link href="/medium-orders" className="text-primary-strong hover:underline font-medium">xem danh sách</Link>
            </p>
          )}
        </CardContent>
      </Card>

      <TodayChecklist />
    </div>
  );
}

function KhoDashboard({
  stats, dailyStats, weeklyStats, role,
}: {
  stats: Awaited<ReturnType<typeof getKhoMoStats>>;
  dailyStats: Awaited<ReturnType<typeof getKhoThanhPhamDailyStats>>;
  weeklyStats: Awaited<ReturnType<typeof getKhoThanhPhamWeeklyStats>>;
  role: UserRole;
}) {
  const mauMe = stats.activeLots.find((l) => l.stage === "MAU_ME");
  const thanhPham = stats.activeLots.find((l) => l.stage === "THANH_PHAM");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tổng quan kho</h1>
        <p className="text-text-secondary text-sm mt-1">{ROLE_LABELS[role]}</p>
      </div>
      <GreetingBanner />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Bàn giao chờ xác nhận" value={stats.pendingTransfers} icon={AlertTriangle} color="yellow" />
        <StatCard title="Lô mẫu mẹ đang lưu" value={mauMe?._count ?? 0} icon={Sun} color="green" subtitle={`${mauMe?._sum?.quantity ?? 0} bình`} />
        <StatCard title="Lô thành phẩm đang lưu" value={thanhPham?._count ?? 0} icon={Package} color="blue" subtitle={`${thanhPham?._sum?.quantity ?? 0} bình`} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Công việc hàng ngày</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <QueueTaskRow
            href="/orders/pack"
            icon={PackageOpen}
            title="1. Sắp đơn hàng"
            description="Đơn đã xác nhận, chờ đóng gói/xuất kho"
            count={dailyStats.packOrdersCount}
            unit="đơn"
          />
          <QueueTaskRow
            href="/inventory/thanh-pham"
            icon={Package}
            title="2. Hàn túi"
            description="Số lượng đang chờ ở Phòng hàn túi (xem tồn kho — trang thao tác riêng chưa có)"
            count={dailyStats.hanTuiQuantity}
            unit="cây"
          />
          <QueueTaskRow
            href="/processing"
            icon={Recycle}
            title="3. Xử lý cây"
            description="Yêu cầu tách túi từ đơn hàng đang chờ xử lý"
            count={dailyStats.processingPendingCount}
            unit="yêu cầu"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Công việc hàng tuần</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <QueueTaskRow
            href="/contamination"
            icon={AlertTriangle}
            title="1. Kiểm tra nhiễm"
            description="Báo cáo nhiễm lô thành phẩm đang chờ xác nhận"
            count={weeklyStats.contaminationPendingCount}
            unit="báo cáo"
          />
          <QueueTaskRow
            icon={AlertTriangle}
            title="2. Đề xuất Trồng/Hủy"
            description="Đề xuất xử lý lô thành phẩm nhiễm — trang riêng cho Kho thành phẩm chưa ra mắt"
          />
          <QueueTaskRow
            href="/inventory/thanh-pham"
            icon={Eye}
            title="3. Kiểm tra cây theo dõi"
            description="Số lượng đang lưu ở Phòng theo dõi (xem tồn kho — trang thao tác riêng chưa có)"
            count={weeklyStats.theoDoiQuantity}
            unit="cây"
          />
          <QueueTaskRow
            icon={RotateCcw}
            title="4. Trả hàng nhà cung cấp"
            description="Nghiệp vụ trả hàng cho nhà cung cấp — chưa ra mắt"
          />
        </CardContent>
      </Card>

      <TodayChecklist />
    </div>
  );
}

// Hàng đợi việc liên tục (không có deadline/% hoàn thành trong ngày như WeeklyTaskRow) — chỉ hiện số
// lượng đang chờ. Không truyền `href` khi tính năng chưa có trang riêng: hiện dạng "Sắp ra mắt", không
// bấm được, để không dẫn nhầm sang trang không liên quan.
function QueueTaskRow({
  href, icon: Icon, title, description, count, unit,
}: {
  href?: string;
  icon: LucideIcon;
  title: string;
  description: string;
  count?: number;
  unit?: string;
}) {
  const hasCount = count !== undefined;
  const isEmpty = hasCount && count === 0;
  const badgeClass = !hasCount
    ? "bg-muted text-text-muted"
    : isEmpty
      ? "bg-primary-light text-primary-strong"
      : "bg-warning-light text-warning-foreground";
  const content = (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2.5 rounded-xl shrink-0 ${!hasCount ? "bg-muted text-text-muted" : isEmpty ? "bg-primary-light text-primary-strong" : "bg-warning-light text-warning-foreground"}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          <p className="text-xs text-text-secondary truncate">{description}</p>
        </div>
      </div>
      <Badge className={`shrink-0 ${badgeClass}`}>
        {hasCount ? `${count.toLocaleString("vi-VN")} ${unit}` : "Sắp ra mắt"}
      </Badge>
    </div>
  );

  if (!href) return content;
  return (
    <Link href={href} className="block hover:bg-primary-light rounded-lg transition-colors">
      {content}
    </Link>
  );
}

function DefaultDashboard({ role, userName }: { role: UserRole; userName: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
        <p className="text-text-secondary text-sm mt-1">{ROLE_LABELS[role]}</p>
      </div>
      <GreetingBanner />
      <TodayChecklist />
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-text-secondary">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 text-text-muted" />
            <p>Chọn một mục từ menu bên trái để bắt đầu.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title, value, icon: Icon, color, subtitle,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  color: "green" | "blue" | "yellow" | "purple" | "red";
  subtitle?: string;
}) {
  const colorMap = {
    green: "bg-primary-light text-primary-strong",
    blue: "bg-info-light text-info-foreground",
    yellow: "bg-warning-light text-warning-foreground",
    purple: "bg-violet-light text-violet-foreground",
    red: "bg-danger-light text-destructive",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1">{value.toLocaleString("vi-VN")}</p>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-xl ${colorMap[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
