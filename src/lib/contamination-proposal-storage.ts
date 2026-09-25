import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

const BUCKET = "contamination-proposal-photos";

// Giống hệt reject-classification-storage.ts (bucket riêng). Khởi tạo lười để tránh crash lúc import
// nếu 2 biến env chưa cấu hình.
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

// Nhận data URL base64 đã nén ở client (compressImageToDataUrl với CONTAMINATION_PROPOSAL_COMPRESS_OPTIONS),
// decode và tải lên bucket "contamination-proposal-photos" (public), trả về URL công khai. Ảnh tải lên
// TRƯỚC khi ContaminationProposal thật sự được tạo (Đối tác vận hành đính ảnh ngay trên form, phiếu chỉ
// sinh ra lúc bấm "Tạo phiếu đề xuất") nên path không gắn theo proposalId.
export async function uploadContaminationProposalPhoto(dataUrl: string, path: string): Promise<string> {
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

// Xoá hẳn 1 ảnh khỏi bucket — nhận thẳng URL công khai, tự suy ra lại path lưu trong bucket. Bỏ qua êm
// nếu không suy ra được path hoặc file đã không còn.
export async function deleteContaminationProposalPhoto(publicUrl: string): Promise<void> {
  const marker = `/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
  if (!path) return;

  const supabase = getStorageClient();
  await supabase.storage.from(BUCKET).remove([path]);
}

const PHOTO_RETENTION_DAYS = 30;

// Xoá HẲN ảnh bằng chứng (không phải bản ghi đề xuất) của mọi ContaminationProposal có createdAt quá
// PHOTO_RETENTION_DAYS ngày — gọi từ lịch node-cron hàng ngày (xem src/instrumentation-node.ts). Ảnh chỉ
// gắn lúc tạo, không đổi qua "Sửa & gửi lại" nên createdAt luôn là mốc chính xác. Best-effort: 1 ảnh lỗi
// xoá storage không chặn các ảnh còn lại.
export async function cleanupExpiredContaminationProposalPhotos(): Promise<{ proposalsCleaned: number }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PHOTO_RETENTION_DAYS);

  const proposals = await prisma.contaminationProposal.findMany({
    where: { createdAt: { lte: cutoff }, photoUrls: { isEmpty: false } },
    select: { id: true, photoUrls: true },
  });

  for (const proposal of proposals) {
    await Promise.all(proposal.photoUrls.map((url) => deleteContaminationProposalPhoto(url).catch(() => {})));
    await prisma.contaminationProposal.update({ where: { id: proposal.id }, data: { photoUrls: [] } });
  }

  return { proposalsCleaned: proposals.length };
}
