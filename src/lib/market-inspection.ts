import { prisma } from "@/lib/prisma";
import { createAlert, createAlertForMarketSaleStaff } from "@/lib/inventory";
import { ensureDeXuatTaskCompletion } from "@/lib/daily-task-weekly";
import { generateDailyTaskCode } from "@/lib/codes";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { startOfWeek, addDays, endOfWeek, format, getWeek } from "date-fns";
import { vi } from "date-fns/locale";
import type { Prisma, RoomType } from "@prisma/client";
import { POT_SPEC_LABELS, RETAIL_MANAGER_MISSING_RELATED_TYPE, FREE_GIFT_CATEGORY_CODE, FREE_GIFT_PLANT_CODE, FREE_GIFT_PLANT_NAME, FREE_GIFT_STAGE_CODE } from "@/types";
import { upsertLot } from "@/lib/goods-receipt";
import { InsufficientRoomStockError } from "@/lib/finished-goods";

// 3 phòng cố định của Kho thị trường (WarehouseType.THI_TRUONG, xem User.workplaceWarehouseId của
// DOI_TAC_VAN_HANH) — dùng cho việc kiểm tra định kì hàng tuần + luồng "Thực hiện" nhiệm vụ, tái dùng
// đúng cơ chế DailyTask(type=DE_XUAT_TRONG_HUY)/ContaminationProposal đã có cho Kho thành phẩm (xem
// src/lib/daily-task-weekly.ts) — CHỈ khác ở chỗ Đối tác vận hành mỗi kho chỉ có 1 người, tự động được
// giao thẳng việc, không qua bước "Quản lý phân công" như Kho thành phẩm.
export const MARKET_ROOM_TYPES: RoomType[] = ["PHONG_SAN_PHAM_DAT", "PHONG_SAN_PHAM_KHONG_DAT", "PHONG_CAY_TRONG"];

// "Kiểm tra định kì hàng tuần" của Đối tác vận hành tự sinh 1 việc/phòng (luôn đủ cả 3, không gộp theo
// Loại cây như Kho thành phẩm vì mỗi phòng ở đây đã đủ nhỏ/đơn mục đích) — tự sinh lazy mỗi lần tải
// trang giống ensureWeeklyDeXuatTask, dùng CHUNG DailyTaskType.DE_XUAT_TRONG_HUY + slotKey riêng
// (`room:<roomId>`) để không đụng slotKey `cat:*`/`market:*` của Kho thành phẩm.
export async function ensureWeeklyMarketInspectionTask(warehouseId: string | null) {
  if (!warehouseId) return;

  // Đối tác vận hành duy nhất phụ trách kho này — không có sẽ không có ai để tự gán, bỏ qua (VD kho vừa
  // tạo, chưa gán người).
  const partner = await prisma.user.findFirst({
    where: { workplaceWarehouseId: warehouseId, role: "DOI_TAC_VAN_HANH", isActive: true },
    select: { id: true },
  });
  if (!partner) return;

  const rooms = await prisma.room.findMany({
    where: { warehouseId, type: { in: MARKET_ROOM_TYPES }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (rooms.length === 0) return;

  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekLabel = ` tuần ${getWeek(weekStart, { weekStartsOn: 1 })} (ngày ${format(weekStart, "dd/MM", { locale: vi })} đến ngày ${format(weekEnd, "dd/MM", { locale: vi })})`;

  const existing = await prisma.dailyTask.findMany({
    where: { type: "DE_XUAT_TRONG_HUY", warehouseId, weekStart },
    select: { slotKey: true },
  });
  const existingSlots = new Set(existing.map((t) => t.slotKey));

  const now = new Date();
  for (const room of rooms) {
    const slotKey = `room:${room.id}`;
    if (existingSlots.has(slotKey)) continue;
    await prisma.dailyTask.create({
      data: {
        code: await generateDailyTaskCode(),
        type: "DE_XUAT_TRONG_HUY",
        warehouseId,
        weekStart,
        slotKey,
        title: `Kiểm tra ${room.name}${weekLabel}`,
        roomId: room.id,
        // Tự động giao thẳng cho Đối tác vận hành — không qua bước "Quản lý phân công" (mỗi kho chỉ 1
        // người phụ trách, khác Kho thành phẩm nhiều NV). assignmentConfirmedAt set sẵn để bỏ qua luôn
        // bước "Xác nhận nhận việc" (xem KhoDashboard/ConfirmTaskButton) — việc tự hiện thẳng ra là chờ
        // thực hiện.
        assignedToId: partner.id,
        assignmentConfirmedAt: now,
        notes: "Tự động tạo hàng tuần, tự động giao cho Đối tác vận hành phụ trách kho này.",
      },
    });
  }

  // Nhắc hạn từ Thứ 4 — hạn hoàn thành trước Thứ 6 tuần này, cùng quy ước với Kho thành phẩm (xem
  // ensureWeeklyDeXuatTask), 1 lần/tuần/việc (dedup qua relatedId).
  const wednesday = addDays(weekStart, 2);
  if (now >= wednesday) {
    const tasksThisWeek = await prisma.dailyTask.findMany({
      where: { type: "DE_XUAT_TRONG_HUY", warehouseId, weekStart, status: "PENDING" },
      select: { slotKey: true, code: true, title: true },
    });
    for (const t of tasksThisWeek) {
      if (!t.slotKey) continue;
      const relatedId = `weekly-de-xuat:${warehouseId}:${format(weekStart, "yyyy-MM-dd")}:${t.slotKey}`;
      const sent = await prisma.alert.findFirst({ where: { type: "DE_XUAT_TRONG_HUY_WEEKLY_DUE", relatedId } });
      if (!sent) {
        await createAlert({
          type: "DE_XUAT_TRONG_HUY_WEEKLY_DUE",
          title: "Nhắc hạn: Kiểm tra định kì hàng tuần",
          message: `Cần hoàn thành "${t.title ?? t.code}" trước Thứ Sáu tuần này.`,
          userId: partner.id,
          relatedId,
          relatedType: "DailyTask",
        });
      }
    }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Báo QL thị trường khi Đối tác để quá hạn kiểm tra từ 1 ngày: hạn là Thứ 6, nên từ Thứ 7 (giờ VN) trở đi việc
// còn chưa làm, hoặc có phiếu bị từ chối mà chưa gửi lại, sẽ được báo. Phiếu đang chờ duyệt không tính vì đó là
// phần việc của QL. Gộp 1 thông báo/kho/tuần. Chỉ xét tuần này và tuần trước để lần chạy đầu không báo dồn
// toàn bộ việc tồn của các tuần cũ.
async function alertOverdueInspection(warehouseId: string, warehouseName: string, partnerName: string) {
  const now = new Date();
  const thisWeek = toStoredWeekStart(startOfWeek(now, { weekStartsOn: 1 }));
  const lastWeek = new Date(thisWeek.getTime() - 7 * DAY_MS);
  const vnToday = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });

  const tasks = await prisma.dailyTask.findMany({
    where: { type: "DE_XUAT_TRONG_HUY", warehouseId, status: "PENDING", weekStart: { in: [lastWeek, thisWeek] } },
    select: {
      weekStart: true,
      room: { select: { name: true } },
      proposals: { where: { status: { not: "DRAFT" } }, select: { status: true } },
    },
  });

  const roomsByWeek = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.weekStart) continue;
    // weekStart lưu dạng 00:00 UTC của Thứ 2 nên +5 ngày ra đúng chuỗi ngày Thứ 7.
    const saturday = new Date(t.weekStart.getTime() + 5 * DAY_MS).toISOString().slice(0, 10);
    if (vnToday < saturday) continue;
    const waitingForPartner = t.proposals.length === 0 || t.proposals.some((p) => p.status === "REJECTED");
    if (!waitingForPartner) continue;
    const key = t.weekStart.toISOString().slice(0, 10);
    roomsByWeek.set(key, [...(roomsByWeek.get(key) ?? []), t.room?.name ?? "Không rõ phòng"]);
  }

  for (const [week, rooms] of roomsByWeek) {
    const relatedId = `market-inspection-overdue:${warehouseId}:${week}`;
    const sent = await prisma.alert.findFirst({ where: { type: "DE_XUAT_TRONG_HUY_WEEKLY_DUE", relatedId }, select: { id: true } });
    if (sent) continue;
    const weekNumber = getWeek(new Date(`${week}T00:00:00`), { weekStartsOn: 1 });
    await createAlertForMarketSaleStaff({
      warehouseId,
      type: "DE_XUAT_TRONG_HUY_WEEKLY_DUE",
      title: "Đối tác vận hành quá hạn kiểm tra định kì",
      message: `${partnerName} (${warehouseName}) chưa hoàn tất kiểm tra tuần ${weekNumber}: ${rooms.join(", ")}. Hạn là Thứ Sáu — vui lòng nhắc Đối tác cập nhật.`,
      relatedId,
      relatedType: "DailyTask",
    });
  }
}

// Kho có Đối tác nhưng chưa có Quản lý bán lẻ thì đề xuất không có ai duyệt — báo Admin/Admin cấp cao. Lặp lại
// tối đa 1 lần/ngày tới khi gán xong; gán xong thì tự tắt các thông báo còn chưa đọc.
async function alertMissingRetailManager(warehouseId: string, warehouseName: string) {
  const relatedId = `market-no-retail-manager:${warehouseId}`;
  const pending = await prisma.contaminationProposal.count({ where: { warehouseId, status: "PENDING" } });
  const since = new Date(Date.now() - DAY_MS);
  for (const targetRole of ["ADMIN", "SUPER_ADMIN"] as const) {
    const recent = await prisma.alert.findFirst({
      where: { relatedId, targetRole, OR: [{ status: "UNREAD" }, { createdAt: { gte: since } }] },
      select: { id: true },
    });
    if (recent) continue;
    await createAlert({
      type: "CONTAMINATION_PROPOSAL",
      title: "Kho thị trường chưa có Quản lý bán lẻ",
      message: `${warehouseName} chưa được gán Quản lý bán lẻ nên đề xuất Trồng/Hủy của Đối tác không có người duyệt${pending > 0 ? ` (đang treo ${pending} dòng)` : ""}. Vui lòng gán ở trang Người dùng.`,
      targetRole,
      relatedId,
      relatedType: RETAIL_MANAGER_MISSING_RELATED_TYPE,
    });
  }
}

// Chạy định kỳ (xem instrumentation-node.ts), không phụ thuộc Đối tác có đăng nhập hay không. Lỗi ở 1 kho không
// chặn các kho còn lại.
export async function syncMarketInspectionAlerts() {
  const warehouses = await prisma.warehouse.findMany({ where: { type: "THI_TRUONG", isActive: true }, select: { id: true, name: true } });
  for (const w of warehouses) {
    try {
      const managerCount = await prisma.retailWarehouseAccess.count({
        where: { warehouseId: w.id, user: { isActive: true, role: "SALE", isRetailManager: true } },
      });
      if (managerCount > 0) {
        await prisma.alert.updateMany({
          where: { relatedId: `market-no-retail-manager:${w.id}`, status: "UNREAD" },
          data: { status: "READ" },
        });
      }
      const partner = await prisma.user.findFirst({
        where: { workplaceWarehouseId: w.id, role: "DOI_TAC_VAN_HANH", isActive: true },
        select: { name: true },
      });
      if (!partner) continue;
      if (managerCount === 0) await alertMissingRetailManager(w.id, w.name);

      await ensureWeeklyMarketInspectionTask(w.id);
      await ensureDeXuatTaskCompletion(w.id);
      if (managerCount > 0) await alertOverdueInspection(w.id, w.name, partner.name);
    } catch (err) {
      console.error(`[cron] Lỗi thông báo kiểm tra định kì kho ${w.name}:`, err);
    }
  }
}

// Đề xuất "Trồng" của Đối tác vận hành được duyệt → cộng đúng số lượng vào Phòng cây trồng cùng kho theo quy
// cách chậu plantStageCode (S/M/L/X/Y/Z/C) — lúc gửi đề xuất đã trừ ở phòng nguồn. Áp dụng cho Trồng từ Phòng sản
// phẩm đạt/không đạt (giống Phân loại hàng không đạt) VÀ trồng lại ngay trong Phòng cây trồng sang quy cách
// chậu khác (VD S → M: trừ S lúc gửi, cộng M lúc duyệt — tổng số cây trong phòng không đổi). Đề xuất Hủy không
// cộng đi đâu (cây ra khỏi kho). Phiếu Trồng từ Phòng cây trồng gửi TRƯỚC khi có ô chọn chậu (plantStageCode
// null) giữ cách cũ: cây ra khỏi kho, không cộng lại.
// Gọi trong transaction duyệt, SAU khi đã set status APPROVED.
export async function moveApprovedMarketPlantingToPlantRoom(tx: Prisma.TransactionClient, proposalIds: string[]): Promise<void> {
  const proposals = await tx.contaminationProposal.findMany({
    where: {
      id: { in: proposalIds }, type: "TRONG", status: "APPROVED", quantity: { gt: 0 },
      room: { type: { in: ["PHONG_SAN_PHAM_DAT", "PHONG_SAN_PHAM_KHONG_DAT", "PHONG_CAY_TRONG"] } },
      warehouse: { type: "THI_TRUONG" },
    },
    select: {
      room: { select: { type: true } },
      warehouseId: true, plantTypeId: true, stageCode: true, plantStageCode: true, quantity: true,
      plantType: { select: { code: true } }, requestedBy: { select: { code: true } },
    },
  });
  for (const p of proposals) {
    const plantRoom = await tx.room.findFirst({ where: { warehouseId: p.warehouseId, type: "PHONG_CAY_TRONG", isActive: true }, select: { id: true } });
    if (!plantRoom) throw new Error("Kho thị trường thiếu Phòng cây trồng — liên hệ Admin kiểm tra lại kho");
    // Phòng cây trồng chỉ chứa quy cách chậu S/M/L/X/Y/Z/C — không bao giờ cộng quy cách túi T vào đây (route duyệt
    // đã chặn trước bằng findMarketPlantingMissingPot, đây là lớp chặn cuối).
    if (!p.plantStageCode) {
      if (p.room?.type === "PHONG_CAY_TRONG") continue; // phiếu cũ — cây ra khỏi kho như trước
      throw new Error("Đề xuất Trồng chưa có quy cách chậu (S/M/L/X/Y/Z/C)");
    }
    await upsertLot(tx, plantRoom.id, p.plantTypeId, p.plantType.code, p.plantStageCode, p.quantity, p.requestedBy.code);
  }
}

type FreeGiftSplitProposal = {
  id: string;
  code: string;
  warehouseId: string;
  quantity: number;
  plantType: { code: string };
  warehouse: { type: string };
};

// Kiểm tra số Free Gift QL bán lẻ nhập cho 1 dòng đề xuất — trả về thông báo lỗi, null = hợp lệ. Tổng luôn giữ
// nguyên số Đối tác đề xuất: Trồng/Hủy = quantity - freeGift nên chỉ cần freeGift không vượt quantity.
export function freeGiftSplitError(p: FreeGiftSplitProposal, freeGift: number): string | null {
  if (p.warehouse.type !== "THI_TRUONG") return "Chỉ đề xuất của Kho thị trường mới duyệt Free Gift được";
  if (p.plantType.code === FREE_GIFT_PLANT_CODE) return `${p.code}: cây Free Gift không chuyển sang Free Gift được nữa`;
  if (freeGift > p.quantity) return `${p.code}: số Free Gift không được vượt số đề xuất (${p.quantity})`;
  return null;
}

// Tách 1 phần (hoặc toàn bộ) dòng đề xuất sang Free Gift. Cây gốc đã bị trừ khỏi phòng nguồn từ lúc Đối tác gửi,
// nên ở đây chỉ cộng vào mã Free Gift của kho — tổng số cây không đổi. Gọi TRƯỚC khi chuyển trạng thái APPROVED.
export async function applyFreeGiftSplit(tx: Prisma.TransactionClient, p: FreeGiftSplitProposal, freeGift: number, staffCode: string): Promise<void> {
  // Chỉ tách dòng còn PENDING — 2 người duyệt cùng lúc thì người sau bị chặn, không cộng Free Gift 2 lần.
  const locked = await tx.contaminationProposal.updateMany({
    where: { id: p.id, status: "PENDING" },
    data: { quantity: p.quantity - freeGift, freeGiftQuantity: freeGift },
  });
  if (locked.count === 0) throw new InsufficientRoomStockError(`Phiếu ${p.code} vừa được xử lý — tải lại trang`);

  const room = await tx.room.findFirst({ where: { warehouseId: p.warehouseId, type: "PHONG_SAN_PHAM_DAT", isActive: true }, select: { id: true } });
  if (!room) throw new InsufficientRoomStockError("Kho thị trường thiếu Phòng sản phẩm đạt — liên hệ Admin kiểm tra lại kho");

  const category = await tx.plantCategory.upsert({
    where: { code: FREE_GIFT_CATEGORY_CODE },
    update: {},
    create: { code: FREE_GIFT_CATEGORY_CODE, name: FREE_GIFT_PLANT_NAME, isActive: false },
    select: { id: true },
  });
  const plantType = await tx.plantType.upsert({
    where: { code: FREE_GIFT_PLANT_CODE },
    update: {},
    create: { code: FREE_GIFT_PLANT_CODE, name: FREE_GIFT_PLANT_NAME, categoryId: category.id, seq: 1, isActive: false },
    select: { id: true },
  });
  await upsertLot(tx, room.id, plantType.id, FREE_GIFT_PLANT_CODE, FREE_GIFT_STAGE_CODE, freeGift, staffCode);
}

// Đề xuất Trồng của Kho thị trường từ Phòng sản phẩm đạt/không đạt mà chưa có quy cách chậu (phiếu gửi trước
// khi có ô chọn chậu) — không duyệt được, QL thị trường phải Từ chối để Đối tác "Sửa & gửi lại" kèm quy cách
// chậu. Trả mã phiếu đầu tiên vi phạm, null = hợp lệ.
export async function findMarketPlantingMissingPot(proposalIds: string[]): Promise<string | null> {
  const p = await prisma.contaminationProposal.findFirst({
    where: {
      id: { in: proposalIds }, type: "TRONG", plantStageCode: null,
      room: { type: { in: ["PHONG_SAN_PHAM_DAT", "PHONG_SAN_PHAM_KHONG_DAT"] } },
      warehouse: { type: "THI_TRUONG" },
    },
    select: { code: true },
  });
  return p?.code ?? null;
}

export const missingPotMessage = (code: string) =>
  `Phiếu ${code} chưa có quy cách chậu (S/M/L/X/Y/Z/C) — Từ chối để Đối tác "Sửa & gửi lại" kèm quy cách chậu`;

// Mã quy cách chậu hợp lệ cho phần Trồng (Phòng cây trồng) — validate ở API gửi/duyệt đề xuất.
export const POT_STAGE_CODE_LIST = Object.keys(POT_SPEC_LABELS) as (keyof typeof POT_SPEC_LABELS)[];

// Duyệt đề xuất Trồng/Hủy của Kho thị trường (Đối tác vận hành gửi) — CHỈ QL thị trường (NV bán hàng có
// RetailWarehouseAccess tới đúng kho), Admin không duyệt thay — khớp luồng Phân loại hàng không đạt.
export async function isMarketSaleApprover(userId: string, role: string | null | undefined, warehouseId: string): Promise<boolean> {
  if (role !== "SALE") return false;
  return !!(await prisma.retailWarehouseAccess.findUnique({ where: { userId_warehouseId: { userId, warehouseId } } }));
}
