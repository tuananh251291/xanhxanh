// Nén ảnh phía client trước khi gửi lên server — ảnh chụp từ điện thoại thường vài MB, resize xuống tối
// đa MAX_DIMENSION cạnh dài + nén JPEG q=0.8 để giữ dung lượng mỗi ảnh nhỏ (Cập nhật hình ảnh định kì
// tích luỹ nhiều ảnh/tuần, không nén sẽ tốn băng thông/Storage không cần thiết).
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export async function compressImageToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không thể xử lý ảnh trên trình duyệt này");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
