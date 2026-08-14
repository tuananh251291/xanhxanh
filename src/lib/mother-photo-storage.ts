import { createClient } from "@supabase/supabase-js";

const BUCKET = "mother-photos";

// Chỉ dùng ở server (route handler) — service role key có quyền ghi bucket, không bao giờ được gửi ra
// client. Khởi tạo lười (không phải ở module scope) để tránh crash lúc import nếu 2 biến env chưa được
// cấu hình (VD môi trường dev chưa thiết lập Supabase Storage) — chỉ lỗi khi thực sự gọi upload.
function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Chưa cấu hình SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — không thể tải ảnh lên");
  }
  return createClient(url, key);
}

// Nhận data URL base64 ("data:image/jpeg;base64,...") đã nén ở client, decode và tải lên bucket
// "mother-photos" (public), trả về URL công khai để lưu vào MotherPhoto.imageUrl.
export async function uploadMotherPhoto(dataUrl: string, path: string): Promise<string> {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) throw new Error("Định dạng ảnh không hợp lệ");
  const [, ext, base64] = match;
  const bytes = Buffer.from(base64, "base64");

  const supabase = getStorageClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${path}.${ext === "jpg" ? "jpeg" : ext}`, bytes, {
      contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
      upsert: false,
    });
  if (error) throw new Error(`Tải ảnh lên thất bại: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${path}.${ext === "jpg" ? "jpeg" : ext}`);
  return data.publicUrl;
}

// Xoá 1 ảnh khỏi bucket theo path lưu lúc upload (suy từ imageUrl) — dùng ở DELETE /api/mother-photos/[id].
export async function deleteMotherPhoto(imageUrl: string): Promise<void> {
  const marker = `/object/public/${BUCKET}/`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return;
  const path = imageUrl.slice(idx + marker.length);
  const supabase = getStorageClient();
  await supabase.storage.from(BUCKET).remove([path]);
}
