"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type Props = { errorLabels?: string[]; reasonText?: string | null };

// Cột "Lý do cụ thể" ở bảng Lệch chỉ định & nguyên nhân — trước đây in thẳng danh sách badge lỗi cấy
// (CAY_MO_SAI) hoặc cả đoạn giải thích dài (KY_THUAT_SAI) ngay trong ô, nhiều lỗi tự xuống nhiều dòng vỡ
// bảng. Nay LUÔN gọn đúng 1 dòng — tóm tắt bị cắt bớt (truncate) + link "Xem chi tiết" mở popup xem đầy
// đủ, không phụ thuộc đo tràn dòng bằng JS.
export default function SpecificReasonCell({ errorLabels, reasonText }: Props) {
  if (errorLabels && errorLabels.length > 0) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate min-w-0 flex-1 text-text-secondary text-sm">{errorLabels.join(", ")}</span>
        <Dialog>
          <DialogTrigger
            render={<button type="button" className="text-info-foreground text-xs underline shrink-0 whitespace-nowrap" />}
          >
            Xem chi tiết
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Lỗi cấy cụ thể</DialogTitle>
            </DialogHeader>
            <div className="flex flex-wrap gap-1.5">
              {errorLabels.map((label, idx) => (
                <Badge key={idx} className="bg-danger-light text-destructive">{label}</Badge>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (reasonText) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate min-w-0 flex-1 text-text-secondary text-sm">{reasonText}</span>
        <Dialog>
          <DialogTrigger
            render={<button type="button" className="text-info-foreground text-xs underline shrink-0 whitespace-nowrap" />}
          >
            Xem chi tiết
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Giải thích nguyên nhân</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-foreground whitespace-pre-line">{reasonText}</p>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return <span className="text-text-muted">—</span>;
}
