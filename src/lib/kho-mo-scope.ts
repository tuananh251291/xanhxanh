import type { Prisma } from "@prisma/client";

// Phạm vi NV cấy mô mà 1 NV Kho mô được bàn giao mẫu mẹ / nhận bàn giao Phòng tối (User.responsibleKhoMoId):
// đúng các NV mình phụ trách + các NV CHƯA được gán Kho mô phụ trách (giữ hành vi cũ "mọi Kho mô cùng kho",
// tránh NV mới tạo/chưa cấu hình bị kẹt không ai nhận). Kết hợp với điều kiện kho làm việc sẵn có ở nơi gọi.
export function cayMoScopeForKhoMo(khoMoUserId: string): Prisma.UserWhereInput {
  return { OR: [{ responsibleKhoMoId: khoMoUserId }, { responsibleKhoMoId: null }] };
}

export function isCayMoInKhoMoScope(staff: { responsibleKhoMoId: string | null }, khoMoUserId: string): boolean {
  return staff.responsibleKhoMoId === null || staff.responsibleKhoMoId === khoMoUserId;
}

export const OUT_OF_KHO_MO_SCOPE_MESSAGE = "NV cấy mô này do NV Kho mô khác phụ trách — bạn không thao tác bàn giao với NV này được";
