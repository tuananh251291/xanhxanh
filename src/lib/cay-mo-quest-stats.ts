import { prisma } from "@/lib/prisma";
import { getInspectionDueAt } from "@/lib/inspection";
import { startOfDay, endOfDay, subDays, format } from "date-fns";

const STREAK_LOOKBACK_DAYS = 365;
const DAYS_PER_LEVEL = 5;

export type QuestKey = "motherReceived" | "dailyRecordDone" | "contaminationChecked" | "handoverDone";

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
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const [
    pendingMotherReceipt,
    dailyRecordToday,
    uninspectedDarkRoomLots,
    handoverToday,
    unreadInspectionResults,
    recentRecordDates,
  ] = await Promise.all([
    prisma.plantingInstruction.findFirst({
      where: { assignedToId: userId, handedOverAt: { not: null }, motherReceivedAt: null },
    }),
    prisma.dailyRecord.findFirst({
      where: { staffId: userId, recordDate: { gte: todayStart, lte: todayEnd } },
    }),
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
    prisma.alert.count({
      where: { userId, type: "INSPECTION_RESULT_READY", status: "UNREAD" },
    }),
    prisma.dailyRecord.findMany({
      where: { staffId: userId, recordDate: { gte: subDays(todayStart, STREAK_LOOKBACK_DAYS) } },
      select: { recordDate: true },
    }),
  ]);

  const now = new Date();
  const hasOverdueDarkRoomLot = uninspectedDarkRoomLots.some((lot) => getInspectionDueAt(lot.enteredAt) <= now);

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
      done: !!dailyRecordToday,
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
      done: !!handoverToday,
    },
  ];

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
