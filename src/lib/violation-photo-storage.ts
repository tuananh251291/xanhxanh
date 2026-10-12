import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { VIOLATION_PHOTO_RETENTION_DAYS } from "@/lib/violation-photo-constants";

const BUCKET = "violation-photos";

// Giống contamination-proposal-storage.ts (bucket riêng). Khởi tạo lười để tránh crash lúc import nếu 2
// biến env chưa cấu hình.
function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Chưa cấu hình SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — không thể tải ảnh lên");
  }
  return createClient(url, key);
}

// Bucket chưa từng tạo qua dashboard — tự tạo (public) nếu chưa tồn tại, idempotent.
async function ensureBucketExists(supabase: ReturnType<typeof getStorageClient>): Promise<void> {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Không tạo được bucket lưu ảnh: ${error.message}`);
  }
}

// Nhận các data URL base64 đã nén + đóng dấu giờ ở client (VIOLATION_PHOTO_COMPRESS_OPTIONS), tải lên
// bucket "violation-photos" (public) dưới thư mục của NV cấy mô, trả về URL công khai theo đúng thứ tự.
export async function uploadViolationPhotos(dataUrls: string[], staffId: string): Promise<string[]> {
  if (dataUrls.length === 0) return [];
  const supabase = getStorageClient();
  await ensureBucketExists(supabase);
  const stamp = Date.now();
  return Promise.all(
    dataUrls.map(async (dataUrl, i) => {
      const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
      if (!match) throw new Error("Định dạng ảnh không hợp lệ");
      const [, ext, base64] = match;
      const normalizedExt = ext === "jpg" ? "jpeg" : ext;
      const path = `${staffId}/${stamp}-${i}-${Math.random().toString(36).slice(2, 8)}.${normalizedExt}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, Buffer.from(base64, "base64"), { contentType: `image/${normalizedExt}`, upsert: false });
      if (error) throw new Error(`Tải ảnh lên thất bại: ${error.message}`);
      return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    })
  );
}

function pathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length)) || null;
}

// Xoá hẳn file khỏi bucket — bỏ qua êm URL không suy ra được path hoặc file đã không còn.
export async function deleteViolationPhotos(publicUrls: string[]): Promise<void> {
  const paths = publicUrls.map(pathFromPublicUrl).filter((p): p is string => !!p);
  if (paths.length === 0) return;
  await getStorageClient().storage.from(BUCKET).remove(paths);
}

// Xoá HẲN ảnh (không phải bản ghi vi phạm) của mọi ViolationRecord quá VIOLATION_PHOTO_RETENTION_DAYS
// ngày — gọi từ lịch node-cron hằng ngày (xem src/instrumentation-node.ts). 1 lượt Kiểm tra kho tối nhiều
// lỗi dùng chung 1 bộ ảnh cho nhiều bản ghi — xoá trùng file đã mất không lỗi gì. Best-effort: 1 bản ghi
// lỗi xoá storage không chặn các bản ghi còn lại (lần chạy sau thử lại vì mảng chưa bị làm rỗng).
export async function cleanupExpiredViolationPhotos(): Promise<{ recordsCleaned: number }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - VIOLATION_PHOTO_RETENTION_DAYS);

  const records = await prisma.violationRecord.findMany({
    where: { createdAt: { lte: cutoff }, photoUrls: { isEmpty: false } },
    select: { id: true, photoUrls: true },
  });

  let recordsCleaned = 0;
  for (const record of records) {
    try {
      await deleteViolationPhotos(record.photoUrls);
      await prisma.violationRecord.update({ where: { id: record.id }, data: { photoUrls: [] } });
      recordsCleaned++;
    } catch (err) {
      console.error(`[violation-photos] Không xoá được ảnh của vi phạm ${record.id}:`, err);
    }
  }
  return { recordsCleaned };
}
