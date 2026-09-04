"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { compressImageToDataUrl } from "@/lib/image-compress";

// 1 ô chụp/chọn ảnh, tự nén trước khi trả về data URL — dùng ở form Tạo giống mới + Cập nhật ảnh (R&D,
// /rnd). Reuse y hệt compressImageToDataUrl đang dùng ở Cập nhật hình ảnh định kỳ (mother-photo-update),
// bấm mở thẳng camera điện thoại qua capture="environment".
export default function PhotoCaptureSlot({
  label, dataUrl, onChange, required,
}: {
  label: string;
  dataUrl: string | null;
  onChange: (dataUrl: string | null) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLoading(true);
    try {
      const compressed = await compressImageToDataUrl(file);
      onChange(compressed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không nén được ảnh — thử lại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      {dataUrl ? (
        <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview, không phải ảnh tĩnh trong dự án */}
          <img src={dataUrl} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"
            aria-label={`Xoá ${label}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-32 h-32 flex-col gap-1"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
          <span className="text-xs">Chụp ảnh</span>
        </Button>
      )}
    </div>
  );
}
