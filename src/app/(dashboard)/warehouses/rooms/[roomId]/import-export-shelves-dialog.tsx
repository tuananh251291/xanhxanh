"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Download, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

type ImportError = { row: number; shelfCode: string; message: string };
type ImportResult = { successCount: number; errors: ImportError[] };

export default function ImportExportShelvesDialog({ roomId, roomCode }: { roomId: string; roomCode: string }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("roomId", roomId);
      const res = await fetch("/api/shelves/import", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Có lỗi xảy ra");
        return;
      }
      setResult(json);
      if (json.errors.length === 0) {
        toast.success(`Đã cập nhật ${json.successCount} kệ`);
      } else {
        toast.error(`Cập nhật ${json.successCount} kệ — ${json.errors.length} dòng lỗi, xem chi tiết bên dưới`);
      }
      router.refresh();
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setResult(null); }}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Xuất/Nhập Excel
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" /> Xuất/Nhập Excel giàn kệ — {roomCode}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-xs text-text-secondary">
            Tải mẫu Excel để điền/sửa mã cây, mã NV, nhóm tuần và số lượng cho từng giàn kệ trong phòng
            này, rồi tải file đã điền lên lại — hệ thống tự áp dụng vào đúng kệ tương ứng (khớp theo Mã
            kệ). Xem ghi chú trong file (sheet &quot;Danh mục&quot;) về ý nghĩa cột Số lượng của từng loại phòng.
          </p>
          <a href={`/api/shelves/export?roomId=${roomId}`}>
            <Button type="button" variant="outline" className="w-full">
              <Download className="w-4 h-4 mr-1.5" /> Tải mẫu Excel
            </Button>
          </a>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
          <Button
            type="button"
            className="w-full bg-primary hover:bg-primary-hover"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
            Tải lên file đã điền
          </Button>

          {result && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Đã cập nhật {result.successCount} kệ{result.errors.length > 0 ? ` — ${result.errors.length} dòng lỗi` : ""}
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-56 overflow-y-auto border border-divider rounded-lg divide-y divide-divider">
                  {result.errors.map((err, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <span className="font-mono font-medium text-destructive">Dòng {err.row} · {err.shelfCode}</span>
                      <p className="text-text-secondary mt-0.5">{err.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
