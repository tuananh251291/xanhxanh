import { createClient } from "@supabase/supabase-js";

const BUCKET = "trial-variety-photos";

// Giống hệt mother-photo-storage.ts (bucket riêng, không dùng chung "mother-photos" — ảnh giống thử
// nghiệm không liên quan Lot/PlantType thật). Khởi tạo lười để tránh crash lúc import nếu 2 biến env
// chưa cấu hình.
function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Chưa cấu hình SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — không thể tải ảnh lên");
  }
  return createClient(url, key);
}

// Bucket "trial-variety-photos" không có sẵn như "mother-photos" (chưa từng tạo qua dashboard) — tự tạo
// (public) nếu chưa tồn tại, idempotent nên gọi lại nhiều lần vẫn an toàn (bỏ qua lỗi "already exists").
async function ensureBucketExists(supabase: ReturnType<typeof getStorageClient>): Promise<void> {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Không tạo được bucket lưu ảnh: ${error.message}`);
  }
}

// Nhận data URL base64 đã nén ở client (xem src/lib/image-compress.ts), decode và tải lên bucket
// "trial-variety-photos" (public), trả về URL công khai để lưu vào TrialVarietyPhoto.photoUrl1/2.
export async function uploadTrialVarietyPhoto(dataUrl: string, path: string): Promise<string> {
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
