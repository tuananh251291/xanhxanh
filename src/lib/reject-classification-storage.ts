import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

const BUCKET = "reject-classification-photos";

// Giống hệt mother-photo-storage.ts/trial-variety-storage.ts (bucket riêng). Khởi tạo lười để tránh
// crash lúc import nếu 2 biến env chưa cấu hình.
function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Chưa cấu hình SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — không thể tải ảnh lên");
  }
  return createClient(url, key);
}

// Bucket chưa từng tạo qua dashboard — tự tạo (public) nếu chưa tồn tại, idempotent nên gọi lại nhiều
// lần vẫn an toàn (bỏ qua lỗi "already exists").
async function ensureBucketExists(supabase: ReturnType<typeof getStorageClient>): Promise<void> {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Không tạo được bucket lưu ảnh: ${error.message}`);
  }
}

// Nhận data URL base64 đã nén ở client (compressImageToDataUrl với REJECT_CLASSIFICATION_COMPRESS_OPTIONS),
// decode và tải lên bucket "reject-classification-photos" (public), trả về URL công khai để append vào
// RejectedGoodsClassificationItem.destroyPhotoUrls/plantPhotoUrls.
export async function uploadRejectClassificationPhoto(dataUrl: string, path: string): Promise<string> {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) throw new Error("Định dạng ảnh không hợp lệ");
  const [, ext, base64] = match;
  const normalizedExt = ext === "jpg" ? "jpeg" : ext;
  const bytes = Buffer.from(base64, "base64");

  const supabase = getStorageClient();
  await ensureBucketExists(supabase);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${path}.${normalizedExt}`, bytes, { contentType: `image/${normalizedExt}`, upsert: false });
  if (error) throw new Error(`Tải ảnh lên thất bại: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${path}.${normalizedExt}`);
  return data.publicUrl;
}

// Xoá hẳn 1 ảnh khỏi bucket (giải phóng dung lượng lưu trữ thật, không chỉ xoá bản ghi DB) — nhận thẳng
// URL công khai đã lưu, tự suy ra lại path lưu trong bucket. Bỏ qua êm nếu không suy ra được path hoặc
// file đã không còn (không chặn xoá bản ghi DB chỉ vì lỗi dọn storage).
export async function deleteRejectClassificationPhoto(publicUrl: string): Promise<void> {
  const marker = `/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
  if (!path) return;

  const supabase = getStorageClient();
  await supabase.storage.from(BUCKET).remove([path]);
}

const PHOTO_RETENTION_DAYS = 30;

// Xoá HẲN ảnh bằng chứng (không phải bản ghi số lượng/ghi chú) của mọi dòng đã "Gửi đề xuất" (submittedAt
// khác null) quá PHOTO_RETENTION_DAYS ngày — gọi từ lịch node-cron hàng ngày (xem src/instrumentation.ts).
// Chỉ xoá ảnh, giữ nguyên rejectedQuantity/destroyQuantity/plantQuantity/saleNote/status để lịch sử tồn
// kho vẫn tra cứu đúng. Best-effort: 1 ảnh lỗi xoá storage không chặn các ảnh còn lại.
export async function cleanupExpiredRejectClassificationPhotos(): Promise<{ itemsCleaned: number }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PHOTO_RETENTION_DAYS);

  const items = await prisma.rejectedGoodsClassificationItem.findMany({
    where: {
      classification: { submittedAt: { lte: cutoff } },
      OR: [{ destroyPhotoUrls: { isEmpty: false } }, { plantPhotoUrls: { isEmpty: false } }],
    },
    select: { id: true, destroyPhotoUrls: true, plantPhotoUrls: true },
  });

  for (const item of items) {
    await Promise.all(
      [...item.destroyPhotoUrls, ...item.plantPhotoUrls].map((url) =>
        deleteRejectClassificationPhoto(url).catch(() => {})
      )
    );
    await prisma.rejectedGoodsClassificationItem.update({
      where: { id: item.id },
      data: { destroyPhotoUrls: [], plantPhotoUrls: [] },
    });
  }

  return { itemsCleaned: items.length };
}
