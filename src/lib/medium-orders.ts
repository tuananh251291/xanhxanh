import { addDays, startOfDay } from "date-fns";

type InstructionItemForOrder = {
  stageCode: string | null;
  quantity: number;
  motherMediumTypeId: string | null;
  expectedFinishedOutput: number | null;
  finishedMediumTypeId: string | null;
};

export type MediumOrderItemInput = {
  stageCode: "M05" | "T01" | "T05";
  mediumTypeId: string;
  quantity: number;
};

// Số lượng môi trường cần theo quy cách CHO 1 CHỈ ĐỊNH — cùng cách tính đã dùng ở luồng "Nhiệm vụ pha
// MT" trước đây: môi trường tính theo đơn vị cây/cụm trực tiếp (KHÔNG quy đổi số túi). M05 lấy từ
// từng dòng quy cách nguồn (mỗi dòng tự có môi trường nhân mẫu mẹ riêng). T01/T05 là số ở cấp chỉ định
// (không tách theo dòng) nên lấy môi trường ra rễ của dòng có expectedFinishedOutput lớn nhất ("dòng
// chủ đạo") — chấp nhận vì 1 chỉ định thực tế hầu như chỉ có 1 dòng quy cách nguồn.
export function buildInstructionMediumNeeds(
  items: InstructionItemForOrder[],
  plannedT01Quantity: number,
  plannedT05Quantity: number
): MediumOrderItemInput[] {
  const result: MediumOrderItemInput[] = [];

  for (const item of items) {
    if (item.stageCode === "M05" && item.motherMediumTypeId && item.quantity > 0) {
      result.push({ stageCode: item.stageCode, mediumTypeId: item.motherMediumTypeId, quantity: item.quantity });
    }
  }

  const dominantItem = items.reduce<InstructionItemForOrder | null>((max, item) => {
    if (!item.finishedMediumTypeId) return max;
    if (!max || (item.expectedFinishedOutput ?? 0) > (max.expectedFinishedOutput ?? 0)) return item;
    return max;
  }, null);

  if (dominantItem?.finishedMediumTypeId) {
    if (plannedT01Quantity > 0) {
      result.push({ stageCode: "T01", mediumTypeId: dominantItem.finishedMediumTypeId, quantity: plannedT01Quantity });
    }
    if (plannedT05Quantity > 0) {
      result.push({ stageCode: "T05", mediumTypeId: dominantItem.finishedMediumTypeId, quantity: plannedT05Quantity });
    }
  }

  return result;
}

// Cộng dồn nhu cầu môi trường của NHIỀU chỉ định (cùng gộp 1 đơn) thành 1 danh sách theo từng cặp
// (quy cách, mã môi trường) — đúng yêu cầu "tổng số túi cần của các chỉ định cộng lại thành 1 đơn".
export function aggregateMediumOrderItems(perInstructionNeeds: MediumOrderItemInput[][]): MediumOrderItemInput[] {
  const map = new Map<string, MediumOrderItemInput>();
  for (const needs of perInstructionNeeds) {
    for (const need of needs) {
      const key = `${need.stageCode}:${need.mediumTypeId}`;
      const existing = map.get(key);
      if (existing) existing.quantity += need.quantity;
      else map.set(key, { ...need });
    }
  }
  return Array.from(map.values());
}

// Khung tuần pha môi trường của 1 đơn, suy từ tuần THỰC HIỆN của chỉ định (instructionWeekStart, thứ
// 2 — trường PlantingInstruction.weekStart) chứ không phải ngày tạo, để nhiều chỉ định tạo rải rác
// trong tuần này (miễn cùng nhắm tới 1 tuần thực hiện) gộp đúng vào 1 đơn: weekStart = Thứ 6 của tuần
// TẠO (3 ngày trước tuần thực hiện), weekEnd = Thứ 6 của tuần thực hiện (weekStart + 7 ngày).
export function getOrderWeekRange(instructionWeekStart: Date): { weekStart: Date; weekEnd: Date; days: Date[] } {
  const weekStart = addDays(startOfDay(instructionWeekStart), -3);
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 8 }, (_, i) => addDays(weekStart, i));
  return { weekStart, weekEnd, days };
}

// Tuần THỰC HIỆN (Thứ 2 - Chủ nhật) mà đơn phục vụ, suy ngược từ MediumOrder.weekStart (Thứ 6 tuần
// TẠO, +3 ngày = Thứ 2 tuần thực hiện — xem getOrderWeekRange). Dùng để hiển thị tóm tắt "đơn của tuần
// nào" cho người dùng — khác weekStart/weekEnd lưu trong DB (Thứ 6 - Thứ 6, chỉ để sinh đủ 8 dòng
// MediumOrderDay pha từ thứ 6 tuần trước), tránh nhầm vì span 2 tuần dương lịch khác nhau. Đơn gửi cho
// NV môi trường từ đúng Thứ 7 (getMediumOrderSendAt) của tuần TẠO, Kho mô bắt đầu nhận bàn giao từ Thứ 2
// tuần thực hiện này.
export function getExecutionWeek(orderWeekStart: Date): { start: Date; end: Date } {
  const start = addDays(startOfDay(orderWeekStart), 3);
  const end = addDays(start, 6);
  return { start, end };
}

export type MediumOrderDayLike = {
  handedOverAt: Date | string | null;
  confirmedAt: Date | string | null;
};

// 1 đơn coi là "đã kết thúc" (xong phần việc của NV môi trường) khi cả 8 ngày trong tuần đều đã được
// bàn giao (handedOverAt) — không xét theo số lượng vì ngày mới tạo luôn có số lượng = 0 (chưa nhập),
// nên không thể dùng "tổng số lượng = 0" để suy ra "không cần bàn giao" (sẽ luôn đúng ngay khi vừa xác
// nhận đơn, làm đơn "kết thúc" ngay lập tức). Dùng chung để: (1) xác định đơn "đang xử lý" (đã xác nhận,
// chưa kết thúc) hiện trên trang "Bàn giao môi trường", (2) chặn 1 NV môi trường xác nhận đơn thứ 2 khi
// đơn hiện tại của họ chưa kết thúc.
export function isMediumOrderFinished(days: MediumOrderDayLike[]): boolean {
  return days.length > 0 && days.every((d) => d.handedOverAt != null);
}

export function isMediumOrderInProgress(order: { confirmedAt: Date | string | null; days: MediumOrderDayLike[] }): boolean {
  return !!order.confirmedAt && !isMediumOrderFinished(order.days);
}

// 1 đơn coi là "đã nhận" (từ góc nhìn Kho mô) khi cả 8 ngày đều đã được Kho mô xác nhận nhận
// (confirmedAt) — dùng để tách 2 danh sách ở trang "Nhận môi trường": "đã nhận" (mọi ngày xong) và
// "đang bàn giao" (còn ít nhất 1 ngày chưa được xác nhận, kể cả khi NV môi trường chưa bàn giao ngày đó).
export function isMediumOrderReceived(days: MediumOrderDayLike[]): boolean {
  return days.length > 0 && days.every((d) => d.confirmedAt != null);
}

// Thời điểm đơn thật sự hiện/báo cho NV môi trường — đúng 00:00 Thứ 7 (weekStart luôn là Thứ 6, xem
// getOrderWeekRange), tức weekStart + 1 ngày. Dùng ở cả nơi tính (ensureMediumOrdersSent) lẫn nơi hiển
// thị (VD cho KY_THUAT xem trước "sẽ gửi lúc nào" nếu cần).
export function getMediumOrderSendAt(weekStart: Date): Date {
  return addDays(weekStart, 1);
}

// Quy đổi số lượng cây/cụm cần sang số TÚI cần hiển thị cho NV môi trường — chốt nghiệp vụ (đã xác nhận
// với chủ dự án): M05/T05 cứ 5 cây/cụm thì cần 1 túi (làm tròn LÊN vì không thể mua nửa túi), T01 giữ
// nguyên 1 cây = 1 túi.
const BAGS_PER_UNIT: Record<string, number> = { M05: 5, T05: 5, T01: 1 };
export function quantityToBags(stageCode: string, quantity: number): number {
  const divisor = BAGS_PER_UNIT[stageCode] ?? 1;
  return Math.ceil(quantity / divisor);
}

// Số túi CÒN CẦN sau khi trừ số túi dư Kho mô đã nhập (surplusQuantity, lưu sẵn theo đơn vị túi — xem
// MediumOrderItem.surplusQuantity) — không âm.
export function netBagsNeeded(stageCode: string, quantity: number, surplusQuantity: number): number {
  return Math.max(0, quantityToBags(stageCode, quantity) - surplusQuantity);
}

// Kho mô chỉ được nhập số lượng môi trường dư vào Thứ 2 hoặc Thứ 3 (chặn cứng theo yêu cầu nghiệp vụ —
// đầu tuần thực hiện, ngay sau khi NV môi trường bàn giao xong tuần trước). getDay(): 0=CN, 1=T2, 2=T3.
export function isMediumSurplusEntryDay(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day === 1 || day === 2;
}
