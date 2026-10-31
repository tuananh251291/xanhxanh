import { createClient } from "@supabase/supabase-js";
import type { Prisma } from "@prisma/client";
import { getManagedOrderScope } from "@/lib/customer-manager";

// Phản hồi khách hàng về đơn đã xuất (OrderFeedback) — lưu ảnh + phạm vi xem danh sách "Đơn hàng có lỗi".

const BUCKET = "order-feedback-photos";

function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Chưa cấu hình SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — không thể tải ảnh lên");
  return createClient(url, key);
}

// Nhận data URL base64 đã nén ở client (ORDER_FEEDBACK_COMPRESS_OPTIONS), tải lên bucket public theo thư mục
// mã đơn, trả về URL công khai đúng thứ tự. Bucket tự tạo nếu chưa có (giống violation-photo-storage.ts).
export async function uploadOrderFeedbackPhotos(dataUrls: string[], orderCode: string): Promise<string[]> {
  if (dataUrls.length === 0) return [];
  const supabase = getStorageClient();
  const { error: bucketError } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (bucketError && !/already exists/i.test(bucketError.message)) throw new Error(`Không tạo được bucket lưu ảnh: ${bucketError.message}`);
  const stamp = Date.now();
  return Promise.all(
    dataUrls.map(async (dataUrl, i) => {
      const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
      if (!match) throw new Error("Định dạng ảnh không hợp lệ");
      const ext = match[1] === "jpg" ? "jpeg" : match[1];
      const path = `${orderCode}/${stamp}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(match[2], "base64"), { contentType: `image/${ext}`, upsert: false });
      if (error) throw new Error(`Tải ảnh lên thất bại: ${error.message}`);
      return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }),
  );
}

// Xem MỌI đơn lỗi: Admin cấp cao, Admin kỹ thuật, QL Kho thành phẩm.
export const canViewAllDefectOrders = (role: string | null | undefined) =>
  role === "SUPER_ADMIN" || role === "ADMIN_KY_THUAT" || role === "QUAN_LY_KHO_THANH_PHAM";
// Chỉ QL Kho thành phẩm xác nhận nguyên nhân (các vai trò khác chỉ xem).
export const canExplainDefect = (role: string | null | undefined) => role === "QUAN_LY_KHO_THANH_PHAM";

// Phạm vi đơn (Order where) 1 người được xem trong "Đơn hàng có lỗi"; null = không có quyền. NV bán hàng: đơn
// của mình + (nếu là người quản lý) đơn của NV mình quản lý theo đúng thị trường — xem getManagedOrderScope.
export async function defectOrderScopeFor(user: { id: string; role: string | null | undefined }): Promise<Prisma.OrderWhereInput | null> {
  if (canViewAllDefectOrders(user.role)) return {};
  if (user.role !== "SALE") return null;
  const managed = await getManagedOrderScope(user.id);
  return { OR: [{ saleId: user.id }, ...managed] };
}
