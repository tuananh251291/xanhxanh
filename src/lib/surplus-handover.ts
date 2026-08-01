import { prisma } from "@/lib/prisma";

export type SurplusCandidate = { id: string; code: string; surplus: number };

// Chỉ định nào của NV còn mẫu mẹ dư CẦN bàn giao cho Kho mô — dùng chung cho quest "Bàn giao MM dư"
// (src/lib/cay-mo-quest-stats.ts) và trang thao tác thật (dashboard-basic/ban-giao-mm-du, cũng như bảng
// "Đã kết thúc" ở /my-instructions). Chỉ 2 lý do kết thúc có thể còn MM chưa dùng hết: TIME_UP (hết tuần)
// và EARLY_END_BY_STAFF (NV tự kết thúc sớm) — MOTHER_USED_UP thì chắc chắn không còn dư. Phải đã từng
// xác nhận nhận mẫu mẹ (chưa xác nhận thì lô gốc chưa hề bị đụng tới, "surplus" tính ra chỉ là toàn bộ
// inputMotherQuantity chứ không phải dư thật) và chưa từng bàn giao dư trước đó.
export async function getSurplusHandoverCandidates(staffId: string): Promise<SurplusCandidate[]> {
  const instructions = await prisma.plantingInstruction.findMany({
    where: {
      assignedToId: staffId,
      status: "ENDED",
      endReason: { in: ["TIME_UP", "EARLY_END_BY_STAFF"] },
      motherReceivedAt: { not: null },
      surplusHandedOverAt: null,
    },
    select: {
      id: true,
      code: true,
      inputMotherQuantity: true,
      dailyRecords: { select: { motherChecked: true } },
    },
  });

  return instructions
    .map((inst) => ({
      id: inst.id,
      code: inst.code,
      surplus: inst.inputMotherQuantity - inst.dailyRecords.reduce((s, r) => s + r.motherChecked, 0),
    }))
    .filter((c) => c.surplus > 0);
}
