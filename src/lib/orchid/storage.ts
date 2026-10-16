import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const BUCKET = "orchid-photos";

// Ảnh sản phẩm hoa lan + ảnh cây hỏng tại điểm bán — cùng cách làm contamination-proposal-storage.ts (bucket
// public riêng, tự tạo nếu chưa có).
function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Chưa cấu hình SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — không thể tải ảnh lên");
  return createClient(url, key);
}

export const ORCHID_PHOTO_MAX_DATA_URL = 9_000_000;
export const orchidPhotoSchema = z.object({
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Ảnh không hợp lệ")
    .refine((v) => v.length <= ORCHID_PHOTO_MAX_DATA_URL, "Ảnh quá lớn"),
});

export async function uploadOrchidPhoto(dataUrl: string, folder: string): Promise<string> {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) throw new Error("Định dạng ảnh không hợp lệ");
  const [, ext, base64] = match;
  const normalizedExt = ext === "jpg" ? "jpeg" : ext;
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${normalizedExt}`;

  const supabase = getStorageClient();
  const { error: bucketError } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (bucketError && !/already exists/i.test(bucketError.message)) throw new Error(`Không tạo được bucket lưu ảnh: ${bucketError.message}`);
  const { error } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(base64, "base64"), { contentType: `image/${normalizedExt}`, upsert: false });
  if (error) throw new Error(`Tải ảnh lên thất bại: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
