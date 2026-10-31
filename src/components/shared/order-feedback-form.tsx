"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImagePlus, Loader2, Send, Star, X } from "lucide-react";
import { toast } from "sonner";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { isDefectRating, MAX_ORDER_FEEDBACK_PHOTOS, ORDER_FEEDBACK_COMPRESS_OPTIONS } from "@/lib/order-feedback-constants";

export function StarRating({ value, onChange, size = "w-7 h-7" }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Star className={`${size} ${n <= value ? "fill-achievement text-achievement-foreground" : "text-border"}`} />;
        return onChange ? (
          <button key={n} type="button" aria-label={`${n} sao`} onClick={() => onChange(n)} className="rounded hover:scale-110 transition-transform">{icon}</button>
        ) : <span key={n}>{icon}</span>;
      })}
    </div>
  );
}

// Form NV bán hàng ghi nhận phản hồi của khách cho đơn đã xuất (POST /api/orders/[id]/feedback): chấm 1–5 sao,
// tối đa 5 ảnh khách gửi (chọn từ máy, nén ở client), link video chi tiết, nội dung.
export default function OrderFeedbackForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rating, setRating] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [content, setContent] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_ORDER_FEEDBACK_PHOTOS - photos.length;
    const picked = [...files].filter((f) => f.type.startsWith("image/"));
    if (picked.length > room) toast.error(`Tối đa ${MAX_ORDER_FEEDBACK_PHOTOS} ảnh — chỉ lấy ${room} ảnh đầu`);
    setCompressing(true);
    try {
      const out: string[] = [];
      for (const f of picked.slice(0, room)) out.push(await compressImageToDataUrl(f, ORDER_FEEDBACK_COMPRESS_OPTIONS));
      setPhotos((p) => [...p, ...out].slice(0, MAX_ORDER_FEEDBACK_PHOTOS));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không đọc được ảnh");
    } finally {
      setCompressing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async () => {
    if (rating < 1) { toast.error("Chọn số sao đánh giá"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, content: content.trim() || undefined, videoUrl: videoUrl.trim() || undefined, photos }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(json.message);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Đánh giá chất lượng của khách</Label>
        <div className="flex items-center gap-3">
          <StarRating value={rating} onChange={setRating} />
          {rating > 0 && <span className="text-sm text-text-secondary">{rating}/5 sao{isDefectRating(rating) ? " — tính là đơn có lỗi" : ""}</span>}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Ảnh khách gửi (tối đa {MAX_ORDER_FEEDBACK_PHOTOS})</Label>
        <div className="flex flex-wrap gap-2">
          {photos.map((src, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh xem trước dạng data URL */}
              <img src={src} alt={`Ảnh ${i + 1}`} className="w-full h-full object-cover" />
              <button type="button" aria-label="Xoá ảnh" onClick={() => setPhotos((p) => p.filter((_, k) => k !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {photos.length < MAX_ORDER_FEEDBACK_PHOTOS && (
            <Button type="button" variant="outline" className="w-20 h-20 flex-col gap-1 text-xs" disabled={compressing || submitting} onClick={() => fileRef.current?.click()}>
              {compressing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
              Gửi ảnh
            </Button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </div>

      <div className="space-y-1">
        <Label>Link video chi tiết</Label>
        <Input placeholder="https://…" value={videoUrl} maxLength={1000} onChange={(e) => setVideoUrl(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Nội dung phản hồi của khách</Label>
        <textarea
          className="w-full min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          maxLength={3000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>

      <Button onClick={submit} disabled={submitting || compressing}>
        {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Gửi phản hồi
      </Button>
    </div>
  );
}
