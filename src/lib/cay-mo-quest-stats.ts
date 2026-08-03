import { prisma } from "@/lib/prisma";
import { getInspectionDueAt } from "@/lib/inspection";
import { getSurplusHandoverCandidates } from "@/lib/surplus-handover";
import { startOfDay, endOfDay, subDays, format, startOfWeek, endOfWeek, differenceInCalendarDays } from "date-fns";

const STREAK_LOOKBACK_DAYS = 365;
const DAYS_PER_LEVEL = 5;
// Khớp MIN_DAYS_SINCE_PLANTED của handover-simple-form.tsx — 1 lô chỉ "sẵn sàng bàn giao" sau đủ số
// ngày ủ tối thiểu này.
const MIN_DAYS_SINCE_PLANTED_FOR_HANDOVER = 7;

export type QuestKey = "motherReceived" | "dailyRecordDone" | "contaminationChecked" | "handoverDone" | "surplusHandover";

export type Quest = {
  key: QuestKey;
  title: string;
  description: string;
  href: string;
  done: boolean;
};

export type MilestoneBadge = {
  key: string;
  label: string;
  description: string;
  earned: boolean;
};

export type CayMoQuestStats = {
  quests: Quest[];
  unreadInspectionResults: number;
  currentStreak: number;
  bestStreak: number;
  totalActiveDays: number;
  level: number;
  xpIntoLevel: number;
  xpTarget: number;
  badges: MilestoneBadge[];
};

function computeStreaks(recordDates: Date[]) {
  const dateSet = new Set(recordDates.map((d) => format(startOfDay(d), "yyyy-MM-dd")));
  const totalActiveDays = dateSet.size;

  const today = startOfDay(new Date());
  let currentStreak = 0;
  let cursor = today;
  if (!dateSet.has(format(cursor, "yyyy-MM-dd"))) {
    cursor = subDays(cursor, 1);
  }
  while (dateSet.has(format(cursor, "yyyy-MM-dd"))) {
    currentStreak++;
    cursor = subDays(cursor, 1);
  }

  const sortedDays = Array.from(dateSet).sort();
  let bestStreak = 0;
  let runLength = 0;
  let prevDay: Date | null = null;
  for (const dayStr of sortedDays) {
    const day = new Date(dayStr);
    if (prevDay && (day.getTime() - prevDay.getTime()) === 86400000) {
      runLength++;
    } else {
      runLength = 1;
    }
    bestStreak = Math.max(bestStreak, runLength);
    prevDay = day;
  }
  bestStreak = Math.max(bestStreak, currentStreak);

  return { currentStreak, bestStreak, totalActiveDays };
}

function buildBadges(bestStreak: number, level: number): MilestoneBadge[] {
  return [
    { key: "streak-3", label: "Khởi động", description: "Chuỗi 3 ngày làm việc liên tục", earned: bestStreak >= 3 },
    { key: "streak-7", label: "Kiên trì", description: "Chuỗi 7 ngày làm việc liên tục", earned: bestStreak >= 7 },
    { key: "streak-30", label: "Bền bỉ", description: "Chuỗi 30 ngày làm việc liên tục", earned: bestStreak >= 30 },
    { key: "level-5", label: "Thợ lành nghề", description: "Đạt cấp độ 5", earned: level >= 5 },
    { key: "level-10", label: "Chuyên gia", description: "Đạt cấp độ 10", earned: level >= 10 },
  ];
}

export async function getCayMoQuestStats(userId: string): Promise<CayMoQuestStats> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const [
    pendingMotherReceipt,
    activeInstructionThisWeek,
    dailyRecordToday,
    darkRoomLots,
    unreadInspectionResults,
    recentRecordDates,
    surplusCandidates,
  ] = await Promise.all([
    prisma.plantingInstruction.findFirst({
      where: { assignedToId: userId, handedOverAt: { not: null }, motherReceivedAt: null },
    }),
    // Dùng để quest "Cập nhật số liệu cấy" không bị kẹt "Chưa xong" khi tuần này chưa/không còn chỉ định
    // nào đang active — NV không có gì để nhập (daily-record-simple-form.tsx tự ẩn form nếu rỗng), nên
    // coi như đã xong thay vì báo lỗi oan.
    prisma.plantingInstruction.findFirst({
      where: { assignedToId: userId, status: "ACTIVE", weekStart: { gte: weekStart, lte: weekEnd } },
    }),
    prisma.dailyRecord.findFirst({
      where: { staffId: userId, recordDate: { gte: todayStart, lte: todayEnd } },
    }),
    // Lấy TẤT CẢ lô đang ở phòng tối cá nhân (không chỉ lô chưa kiểm tra) — dùng chung cho 2 quest:
    // "Kiểm tra nhiễm" (lô chưa kiểm tra và đã quá hạn) và "Bàn giao sản phẩm" (lô đã đủ điều kiện bàn
    // giao — đã kiểm tra hết + đủ ngày ủ tối thiểu, khớp readyGroups của handover-simple-form.tsx). Gồm
    // CẢ lô có chỉ định cấy gán cho mình LẪN lô nằm thẳng trong đúng phòng tối của mình dù không gắn chỉ
    // định nào (VD Admin/KHO_MO nhập tay qua Nhập kho thủ công — instructionId null) — thiếu vế "room"
    // sẽ khiến lô nhập tay bị bỏ sót hoàn toàn, quest không bao giờ báo dù đã quá hạn thật.
    prisma.lot.findMany({
      where: {
        status: "ACTIVE",
        room: { type: "PHONG_TOI", assignedStaffId: userId },
      },
      select: { code: true, enteredAt: true, inspectedAt: true },
    }),
    prisma.alert.count({
      where: { userId, type: "INSPECTION_RESULT_READY", status: "UNREAD" },
    }),
    prisma.dailyRecord.findMany({
      where: { staffId: userId, recordDate: { gte: subDays(todayStart, STREAK_LOOKBACK_DAYS) } },
      select: { recordDate: true },
    }),
    getSurplusHandoverCandidates(userId),
  ]);

  const hasOverdueDarkRoomLot = darkRoomLots.some(
    (lot) => !lot.inspectedAt && getInspectionDueAt(lot.enteredAt) <= now
  );

  // Nhóm theo CẢ mã lẫn ngày nhập thật (không chỉ mã) — mã lô không đảm bảo duy nhất theo ngày, khớp
  // đúng cách product-handover-board.tsx/handover-simple-form.tsx đã sửa (gộp theo mã sẽ gộp nhầm lô
  // khác ngày trùng mã vào chung 1 nhóm).
  const darkRoomGroups = new Map<string, typeof darkRoomLots>();
  for (const lot of darkRoomLots) {
    const key = `${lot.code}__${format(lot.enteredAt, "yyyy-MM-dd")}`;
    const group = darkRoomGroups.get(key);
    if (group) group.push(lot);
    else darkRoomGroups.set(key, [lot]);
  }
  // "Còn việc cần bàn giao" = có ít nhất 1 nhóm đã đủ ngày ủ tối thiểu, KHÔNG đòi hỏi đã kiểm tra nhiễm
  // xong — khớp đúng điều kiện product-handover-board.tsx dùng để HIỆN 1 thẻ lô (thẻ vẫn hiện, chỉ bị
  // khoá nút bàn giao, kèm nhắc "Cần kiểm tra nhiễm trước khi bàn giao" nếu chưa kiểm tra). Trước đây đòi
  // hỏi "đã kiểm tra nhiễm xong" mới tính là "còn việc" khiến quest báo "Đã xong" sai khi NV chưa kiểm tra
  // nhiễm lô nào cả (không có nhóm nào "sẵn sàng" nên hasReadyForHandoverGroup=false → done=true), dù rõ
  // ràng còn nhiều lô quá hạn đang treo (chỉ đang bị chặn bởi nhiệm vụ "Kiểm tra nhiễm" riêng).
  const hasPendingHandoverGroup = Array.from(darkRoomGroups.values()).some(
    (group) => differenceInCalendarDays(now, group[0].enteredAt) >= MIN_DAYS_SINCE_PLANTED_FOR_HANDOVER
  );

  const quests: Quest[] = [
    {
      key: "motherReceived",
      title: "Nhận bàn giao mẫu mẹ",
      description: "Xác nhận đã nhận mẫu mẹ từ Kho mô",
      href: "/dashboard-basic/nhan-mau-me",
      done: !pendingMotherReceipt,
    },
    {
      key: "dailyRecordDone",
      title: "Cập nhật số liệu cấy",
      description: "Nhập nhật ký cấy mô trong ngày",
      href: "/dashboard-basic/cap-nhat-so-lieu",
      done: !activeInstructionThisWeek || !!dailyRecordToday,
    },
    {
      key: "contaminationChecked",
      title: "Kiểm tra nhiễm phòng tối",
      description: "Kiểm tra và báo cáo nhiễm các lô trong phòng tối",
      href: "/dashboard-basic/kiem-tra-nhiem",
      done: !hasOverdueDarkRoomLot,
    },
    {
      key: "handoverDone",
      title: "Bàn giao sản phẩm",
      description: "Bàn giao lô từ phòng tối cho Kho mô",
      href: "/dashboard-basic/ban-giao",
      done: !hasPendingHandoverGroup,
    },
  ];

  // "Bàn giao MM dư" — KHÔNG hiện cố định như 4 nhiệm vụ trên, chỉ hiện khi thực sự có mẫu mẹ dư cần bàn
  // giao (VD vừa "Kết thúc chỉ định sớm") HOẶC vào đúng Thứ 7/Chủ nhật (nhắc trước, vì đây là 2 ngày duy
  // nhất 1 chỉ định có thể kết thúc — xem POST /api/daily-records) — tránh làm rối danh sách việc các
  // ngày thường khi chưa có gì cần xử lý.
  const dayOfWeek = now.getDay(); // 0 = Chủ nhật, 6 = Thứ 7
  const isWeekendDay = dayOfWeek === 6 || dayOfWeek === 0;
  const hasPendingSurplus = surplusCandidates.length > 0;
  if (hasPendingSurplus || isWeekendDay) {
    quests.push({
      key: "surplusHandover",
      title: "Bàn giao MM dư",
      description: "Bàn giao mẫu mẹ dư của chỉ định đã kết thúc cho Kho mô",
      href: "/dashboard-basic/ban-giao-mm-du",
      done: !hasPendingSurplus,
    });
  }

  const { currentStreak, bestStreak, totalActiveDays } = computeStreaks(
    recentRecordDates.map((r) => r.recordDate)
  );

  const level = Math.floor(totalActiveDays / DAYS_PER_LEVEL) + 1;
  const xpIntoLevel = totalActiveDays % DAYS_PER_LEVEL;

  return {
    quests,
    unreadInspectionResults,
    currentStreak,
    bestStreak,
    totalActiveDays,
    level,
    xpIntoLevel,
    xpTarget: DAYS_PER_LEVEL,
    badges: buildBadges(bestStreak, level),
  };
}
