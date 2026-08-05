"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type ImportRowError = { row: number; label: string; message: string };
// zeroedCount: riêng cho mục "Lô tồn kho hiện có" (chế độ CẬP NHẬT THAY THẾ) — số lô bị đưa quantity về
// 0 vì không còn xuất hiện trong file cho đúng vị trí đó. Các mục nhập Excel khác không trả field này.
export type ImportResult = { successCount: number; zeroedCount?: number; errors: ImportRowError[] };

// Card nhập Excel dùng chung cho mọi mục ở trang "Nhập liệu trực tiếp" (/settings/data-import) —
// generalize từ warehouses/rooms/[roomId]/import-export-shelves-dialog.tsx (dialog cho 1 phòng) sang
// dạng Card tĩnh nằm thẳng trên trang liệt kê nhiều mục cùng lúc. Quy ước response giống hệt các route
// nhập Excel hiện có: { successCount, errors: {row, ..., message}[] }.
export default function ExcelImportCard({
  icon,
  title,
  description,
  templateUrl,
  uploadUrl,
  extraFormData,
  disabled = false,
  disabledHint,
  successLabel,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  templateUrl: string;
  uploadUrl: string;
  extraFormData?: Record<string, string>;
  disabled?: boolean;
  disabledHint?: string;
  successLabel?: (count: number) => string;
  children?: React.ReactNode;
}) {
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
      if (extraFormData) {
        for (const [key, value] of Object.entries(extraFormData)) formData.append(key, value);
      }
      const res = await fetch(uploadUrl, { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Có lỗi xảy ra");
        return;
      }
      setResult(json);
      if (json.errors.length === 0) {
        const label = successLabel ? successLabel(json.successCount) : `Đã nhập ${json.successCount} dòng`;
        const zeroedSuffix = json.zeroedCount > 0 ? ` — kèm ${json.zeroedCount} lô bị đưa về 0 (không còn trong file)` : "";
        toast.success(`${label}${zeroedSuffix}`);
      } else {
        // File có dòng lỗi = KHÔNG ghi gì cả (xem các route /api/data-import/*) — báo rõ chưa nhập được
        // gì, tránh hiểu nhầm "đã nhập 0 dòng" là hệ thống có lỗi, thay vì hiểu đúng là cần sửa & tải lại.
        toast.error(`Chưa nhập được gì — file có ${json.errors.length} dòng lỗi, xem chi tiết bên dưới rồi sửa lại và tải lên lại`);
      }
      router.refresh();
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon} {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}

        {disabled && disabledHint && (
          <p className="text-xs text-warning-foreground bg-warning-light rounded-md px-3 py-2">{disabledHint}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <a href={disabled ? undefined : templateUrl} className="flex-1">
            <Button type="button" variant="outline" className="w-full" disabled={disabled}>
              <Download className="w-4 h-4 mr-1.5" /> Tải mẫu Excel
            </Button>
          </a>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} disabled={disabled} />
          <Button
            type="button"
            className="flex-1 bg-primary hover:bg-primary-hover"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
            Tải lên file đã điền
          </Button>
        </div>

        {result && (
          <div className="space-y-2 pt-1">
            <p className={`text-sm font-medium ${result.errors.length > 0 ? "text-destructive" : "text-foreground"}`}>
              {result.errors.length > 0
                ? `Chưa nhập được gì — file có ${result.errors.length} dòng lỗi, cần sửa hết rồi tải lên lại`
                : `Đã nhập ${result.successCount} dòng${result.zeroedCount ? ` — kèm ${result.zeroedCount} lô bị đưa về 0 (không còn trong file)` : ""}`}
            </p>
            {result.errors.length > 0 && (
              <div className="max-h-56 overflow-y-auto border border-divider rounded-lg divide-y divide-divider">
                {result.errors.map((err, i) => (
                  <div key={i} className="px-3 py-2 text-xs">
                    <span className="font-mono font-medium text-destructive">Dòng {err.row} · {err.label}</span>
                    <p className="text-text-secondary mt-0.5">{err.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
