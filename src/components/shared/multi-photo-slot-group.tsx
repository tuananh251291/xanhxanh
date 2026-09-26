"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, X } from "lucide-react";

// Nhiều ảnh/1 ô (khác PhotoCaptureSlot — chỉ 1 ảnh) — mỗi ảnh thêm vào gọi upload ngay (onAdd tự nén +
// tải lên), không giữ ở dạng data URL chờ submit chung. Dùng ở Phân loại hàng không đạt (nội bộ,
// reject-classification-detail-board.tsx) và Đề xuất Trồng/Hủy của Đối tác vận hành
// (de-xuat-execute-form.tsx) — tách thành component dùng chung để không viết lại logic hiển thị/xoá ảnh.
//
// `capture="environment"` — bắt buộc chụp trực tiếp bằng camera sau, KHÔNG cho chọn ảnh có sẵn trong thư
// viện (yêu cầu nghiệp vụ: ảnh bằng chứng phải là ảnh chụp tại chỗ, không phải ảnh cũ/ảnh lấy từ nơi
// khác) — khác PhotoCaptureSlot (cố tình bỏ trống capture để NV chọn được ảnh có sẵn, dùng cho ảnh sinh
// trưởng định kì không cần "tại chỗ"). Trình duyệt di động (Chrome/Safari Android/iOS) tôn trọng thuộc
// tính này và mở thẳng camera; trên desktop KHÔNG có camera thì input rơi về chọn file thường — đây là
// giới hạn của web, không có cách nào chặn tuyệt đối 100% qua HTML/JS thuần.
export default function MultiPhotoSlotGroup({
  urls, editable, uploading, onAdd, onRemove,
}: {
  urls: string[];
  editable: boolean;
  uploading: boolean;
  onAdd: (file: File) => void;
  onRemove: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url) => (
        <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- ảnh từ Supabase Storage, không phải asset tĩnh */}
          <img src={url} alt="Ảnh bằng chứng" className="w-full h-full object-cover cursor-pointer" onClick={() => window.open(url, "_blank")} />
          {editable && (
            <button
              type="button"
              onClick={() => onRemove(url)}
              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
              aria-label="Xoá ảnh"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onAdd(f); }}
          />
          <Button
            type="button"
            variant="outline"
            className="w-16 h-16 shrink-0"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </Button>
        </>
      )}
    </div>
  );
}
