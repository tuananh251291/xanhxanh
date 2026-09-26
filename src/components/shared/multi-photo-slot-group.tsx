"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, X } from "lucide-react";
import CameraCaptureDialog from "@/components/shared/camera-capture-dialog";

// Nhiều ảnh/1 ô (khác PhotoCaptureSlot — chỉ 1 ảnh) — mỗi ảnh thêm vào gọi upload ngay (onAdd tự nén +
// tải lên), không giữ ở dạng data URL chờ submit chung. Dùng ở Phân loại hàng không đạt (nội bộ,
// reject-classification-detail-board.tsx) và Đề xuất Trồng/Hủy của Đối tác vận hành
// (de-xuat-execute-form.tsx) — tách thành component dùng chung để không viết lại logic hiển thị/xoá ảnh.
//
// Dùng CameraCaptureDialog (mở thẳng luồng camera qua getUserMedia) thay vì <input type="file"> — kể cả
// có capture="environment", input file vẫn chỉ là GỢI Ý cho trình duyệt và trên máy tính/laptop rơi về
// hộp thoại chọn file thường (chọn được bất kỳ ảnh có sẵn). Yêu cầu nghiệp vụ là khoá TUYỆT ĐỐI, chỉ nhận
// ảnh chụp trực tiếp từ điện thoại — CameraCaptureDialog tự chặn hẳn thiết bị không phải điện thoại và
// không đi qua bất kỳ hộp thoại hệ điều hành nào để "trốn" ra ngoài chọn file.
export default function MultiPhotoSlotGroup({
  urls, editable, uploading, onAdd, onRemove,
}: {
  urls: string[];
  editable: boolean;
  uploading: boolean;
  onAdd: (file: File) => void;
  onRemove: (url: string) => void;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
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
          <Button
            type="button"
            variant="outline"
            className="w-16 h-16 shrink-0"
            disabled={uploading}
            onClick={() => setCameraOpen(true)}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </Button>
          <CameraCaptureDialog open={cameraOpen} onOpenChange={setCameraOpen} onCaptured={onAdd} />
        </>
      )}
    </div>
  );
}
