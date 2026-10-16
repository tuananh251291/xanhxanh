"use client";

import { useState } from "react";
import { toast } from "sonner";
import MultiPhotoSlotGroup from "@/components/shared/multi-photo-slot-group";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { MAX_VIOLATION_PHOTOS, VIOLATION_PHOTO_COMPRESS_OPTIONS } from "@/lib/violation-photo-constants";

// Ảnh bằng chứng (tối đa 3) khi Kho mô/Trợ lý ghi lỗi vi phạm NV cấy mô — chụp trực tiếp bằng camera điện thoại
// (CameraCaptureDialog qua MultiPhotoSlotGroup), đóng dấu giờ chụp lên ảnh và nén ngay trên máy (~300KB).
// Giữ ở dạng data URL trong state, chỉ tải lên cùng lúc bấm "Ghi nhận" (không có ảnh mồ côi nếu huỷ).
export default function ViolationPhotoPicker({
  photos, onChange, disabled, required,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  disabled?: boolean;
  // Có lỗi đang chọn bắt buộc ảnh (ViolationType.requiresPhoto) — chỉ đổi dòng hướng dẫn, form tự chặn submit.
  required?: boolean;
}) {
  const [processing, setProcessing] = useState(false);

  const add = async (file: File) => {
    if (photos.length >= MAX_VIOLATION_PHOTOS) {
      toast.error(`Chỉ chụp tối đa ${MAX_VIOLATION_PHOTOS} ảnh — xoá bớt ảnh cũ để chụp lại`);
      return;
    }
    setProcessing(true);
    try {
      const compressed = await compressImageToDataUrl(file, { ...VIOLATION_PHOTO_COMPRESS_OPTIONS, stampTimestamp: true });
      onChange([...photos, compressed]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xử lý được ảnh");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-1">
      <MultiPhotoSlotGroup
        urls={photos}
        editable={!disabled}
        uploading={processing}
        onAdd={add}
        onRemove={(url) => onChange(photos.filter((p) => p !== url))}
        maxCount={MAX_VIOLATION_PHOTOS}
      />
      <p className={`text-xs ${required && photos.length === 0 ? "text-destructive" : "text-text-muted"}`}>
        {required ? "Bắt buộc ít nhất 1 ảnh" : "Tuỳ chọn"}, tối đa {MAX_VIOLATION_PHOTOS} ảnh chụp trực tiếp bằng điện thoại ({photos.length}/{MAX_VIOLATION_PHOTOS}) — ảnh được đóng giờ chụp, gửi kèm thông báo cho NV cấy mô và tự xoá sau 14 ngày.
      </p>
    </div>
  );
}
