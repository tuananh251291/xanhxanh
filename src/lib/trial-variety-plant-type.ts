import type { Prisma } from "@prisma/client";

// Giống thử nghiệm R&D (TrialVariety) MẶC ĐỊNH được đưa vào sản xuất luôn — tạo kèm 1 mã cây sản xuất
// (PlantType) CÙNG mã (VD "MT997", vẫn sinh theo generateTrialVarietyCode — giảm dần từ 999 và đã bỏ qua mọi
// mã cây sản xuất có sẵn nên không trùng), cùng tên/Loại cây/thời gian cấy chuyển — để dùng được ngay ở chỉ
// định cấy, nhập kho, tồn kho... như mọi mã cây khác. Đã có mã cây trùng mã thì giữ nguyên (không tạo lại).
export async function ensurePlantTypeForTrialVariety(
  tx: Prisma.TransactionClient,
  v: { code: string; name: string; plantCategoryId: string; description?: string | null; transferWaitWeeks: number }
): Promise<{ created: boolean }> {
  const existing = await tx.plantType.findUnique({ where: { code: v.code }, select: { id: true } });
  if (existing) return { created: false };
  // seq chỉ dùng sắp thứ tự hiển thị trong Loại cây — lấy số lớn nhất + 1 (giống POST /api/plant-types).
  const maxSeq = await tx.plantType.aggregate({ where: { categoryId: v.plantCategoryId }, _max: { seq: true } });
  await tx.plantType.create({
    data: {
      code: v.code,
      name: v.name,
      categoryId: v.plantCategoryId,
      seq: (maxSeq._max.seq ?? 0) + 1,
      description: v.description || null,
      transferWaitWeeks: v.transferWaitWeeks,
    },
  });
  return { created: true };
}
