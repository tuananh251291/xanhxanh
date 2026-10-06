import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

// Ảnh selfie chấm công là dữ liệu cá nhân — bucket PRIVATE (khác các bucket ảnh nghiệp vụ public), chỉ
// xem qua URL ký tạm thời (createSignedUrls) ở các route đã kiểm tra quyền. Lưu path trong bucket, không
// lưu URL công khai.
const BUCKET = "attendance-selfies";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const ATTENDANCE_PHOTO_RETENTION_DAYS = 30;

function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Chưa cấu hình SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — không thể tải ảnh lên");
  }
  return createClient(url, key);
}

async function ensureBucketExists(supabase: ReturnType<typeof getStorageClient>): Promise<void> {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Không tạo được bucket lưu ảnh: ${error.message}`);
  }
}

// Nhận data URL đã nén ở client (ATTENDANCE_SELFIE_COMPRESS_OPTIONS), trả về path trong bucket.
export async function uploadAttendanceSelfie(dataUrl: string, path: string): Promise<string> {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) throw new Error("Định dạng ảnh không hợp lệ");
  const [, ext, base64] = match;
  const normalizedExt = ext === "jpg" ? "jpeg" : ext;
  const fullPath = `${path}.${normalizedExt}`;

  const supabase = getStorageClient();
  await ensureBucketExists(supabase);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fullPath, Buffer.from(base64, "base64"), { contentType: `image/${normalizedExt}`, upsert: false });
  if (error) throw new Error(`Tải ảnh lên thất bại: ${error.message}`);
  return fullPath;
}

// path -> URL ký tạm (1 giờ). Path lỗi/không còn thì bỏ qua.
export async function signAttendanceSelfies(paths: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const supabase = getStorageClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  }
  return out;
}

// Xoá hẳn ảnh selfie của các lượt chấm công quá 30 ngày — gọi từ node-cron hằng ngày (xem
// src/instrumentation-node.ts). Giữ nguyên giờ chấm/toạ độ, chỉ bỏ ảnh.
export async function cleanupExpiredAttendanceSelfies(): Promise<{ recordsCleaned: number }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ATTENDANCE_PHOTO_RETENTION_DAYS);

  const records = await prisma.attendanceRecord.findMany({
    where: { createdAt: { lte: cutoff }, OR: [{ checkInPhotoPath: { not: null } }, { checkOutPhotoPath: { not: null } }] },
    select: { id: true, checkInPhotoPath: true, checkOutPhotoPath: true },
  });
  if (records.length === 0) return { recordsCleaned: 0 };

  const supabase = getStorageClient();
  const paths = records.flatMap((r) => [r.checkInPhotoPath, r.checkOutPhotoPath]).filter((p): p is string => !!p);
  // remove() nhận tối đa ~1000 path/lần — chia lô cho an toàn.
  for (let i = 0; i < paths.length; i += 500) {
    await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 500)).catch(() => null);
  }
  await prisma.attendanceRecord.updateMany({
    where: { id: { in: records.map((r) => r.id) } },
    data: { checkInPhotoPath: null, checkOutPhotoPath: null },
  });
  return { recordsCleaned: records.length };
}

export async function deleteAttendanceSelfie(path: string): Promise<void> {
  const supabase = getStorageClient();
  await supabase.storage.from(BUCKET).remove([path]);
}
