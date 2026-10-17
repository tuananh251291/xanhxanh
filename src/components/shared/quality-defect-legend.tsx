import { QUALITY_DEFECT_LABELS } from "@/lib/quality-defects";

// Chú thích 5 cột "Lỗi 1..Lỗi 5" — đặt ngay trên các bảng đánh giá chất lượng (xem src/lib/quality-defects.ts).
export default function QualityDefectLegend() {
  return (
    <div className="text-xs text-text-secondary bg-info-light rounded-lg px-3 py-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-0.5">
      {QUALITY_DEFECT_LABELS.map((label, i) => (
        <p key={label}>
          <span className="font-bold text-info-foreground">Lỗi {i + 1}:</span> {label}
        </p>
      ))}
    </div>
  );
}
