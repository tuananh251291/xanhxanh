import { addDays, startOfDay } from "date-fns";

type InstructionItemForOrder = {
  stageCode: string | null;
  quantity: number;
  motherMediumTypeId: string | null;
  expectedFinishedOutput: number | null;
  finishedMediumTypeId: string | null;
};

export type MediumOrderItemInput = {
  stageCode: "M03" | "M05" | "T01" | "T05";
  mediumTypeId: string;
  quantity: number;
};

// Số lượng môi trường cần theo quy cách CHO 1 CHỈ ĐỊNH — cùng cách tính đã dùng ở luồng "Nhiệm vụ pha
// MT" trước đây: môi trường tính theo đơn vị cây/cụm trực tiếp (KHÔNG quy đổi số túi). M03/M05 lấy từ
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
    if ((item.stageCode === "M03" || item.stageCode === "M05") && item.motherMediumTypeId && item.quantity > 0) {
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
