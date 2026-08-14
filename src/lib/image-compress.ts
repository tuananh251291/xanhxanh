// Nén ảnh phía client trước khi gửi lên server — ảnh chụp từ điện thoại thường vài MB, resize + nén
// JPEG để giữ dung lượng mỗi ảnh nhỏ (Cập nhật hình ảnh định kì tích luỹ nhiều ảnh/tuần, không nén sẽ
// tốn băng thông/Storage không cần thiết, mạng hiện trường sản xuất cũng thường yếu).
//
// Chiến lược: thử theo bậc kích thước (không upscale — bậc lớn nhất chỉ resize xuống nếu ảnh gốc to hơn,
// xem drawToCanvas) x bậc chất lượng, dừng ngay khi đạt mục tiêu ~700KB; nếu hết bậc chất lượng ở 1 kích
// thước mà đã dưới hard limit 2MB thì dừng luôn (ưu tiên giữ độ nét, không thu nhỏ thêm nếu không cần);
// chỉ thật sự giảm kích thước tiếp khi cả bậc chất lượng thấp nhất vẫn vượt hard limit.
const DIMENSION_STEPS = [1600, 1280, 1024, 800, 640] as const;
const QUALITY_STEPS = [0.8, 0.75, 0.7, 0.65, 0.6, 0.5, 0.4] as const;
const TARGET_MAX_BYTES = 700 * 1024;
const HARD_LIMIT_BYTES = 2 * 1024 * 1024;

// `imageOrientation: "from-image"` bắt trình duyệt tự xoay/lật ảnh theo đúng thẻ EXIF Orientation trước
// khi trả bitmap — bắt buộc phải truyền rõ, vì canvas.toDataURL/toBlob KHÔNG ghi lại EXIF, nếu không
// "bake" hướng đúng vào pixel ngay từ bước decode này thì ảnh xuất ra sẽ bị xoay sai (ảnh chụp dọc từ
// điện thoại là ví dụ hay gặp nhất).
async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Không đọc được ảnh — thử chụp lại hoặc chọn ảnh khác");
  }
}

function drawToCanvas(bitmap: ImageBitmap, maxDimension: number): HTMLCanvasElement {
  // scale chặn ở 1 — không upscale ảnh gốc đã nhỏ hơn maxDimension.
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không thể xử lý ảnh trên trình duyệt này");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

// canvas.toBlob mã hoá bất đồng bộ (khác toDataURL chạy đồng bộ, có thể giật UI với ảnh lớn) — dùng để
// không chặn main thread trong lúc nén.
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Không thể nén ảnh"))),
      "image/jpeg",
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Không thể đọc ảnh đã nén"));
    reader.readAsDataURL(blob);
  });
}

// Giải phóng bộ đệm canvas ngay (một số trình duyệt di động chỉ thu hồi khi GC chạy, đặt width/height về
// 0 buộc giải phóng sớm) — 1 phiên chụp ảnh định kì có thể chụp hàng chục giàn liên tiếp, không dọn sẽ
// tích luỹ bộ nhớ.
function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

export async function compressImageToDataUrl(file: File): Promise<string> {
  const bitmap = await loadBitmap(file);

  try {
    let bestBlob: Blob | null = null;

    for (const maxDimension of DIMENSION_STEPS) {
      const canvas = drawToCanvas(bitmap, maxDimension);
      try {
        for (const quality of QUALITY_STEPS) {
          const blob = await canvasToBlob(canvas, quality);
          bestBlob = blob;
          if (blob.size <= TARGET_MAX_BYTES) return await blobToDataUrl(blob);
        }
      } finally {
        releaseCanvas(canvas);
      }
      // Hết bậc chất lượng ở kích thước này mà chưa đạt mục tiêu 700KB nhưng đã dưới hard limit 2MB —
      // dừng luôn, không thu nhỏ thêm để giữ ảnh nét nhất có thể trong giới hạn cho phép.
      if (bestBlob && bestBlob.size <= HARD_LIMIT_BYTES) return await blobToDataUrl(bestBlob);
      // Ngược lại (vẫn vượt hard limit) mới thử bậc kích thước nhỏ hơn tiếp theo.
    }

    // Đã thử hết mọi kích thước/chất lượng — trả về bản nén nhỏ nhất có được (best effort), KHÔNG BAO
    // GIỜ upload ảnh gốc chưa xử lý dù kết quả cuối vẫn còn lớn hơn hard limit (trường hợp gần như không
    // xảy ra với ảnh chụp thực tế ở 640px/quality 0.4).
    if (!bestBlob) throw new Error("Không thể nén ảnh");
    return await blobToDataUrl(bestBlob);
  } finally {
    bitmap.close();
  }
}
