"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const fmtMonth = (month: string) => month.split("-").reverse().join("/");

export default function RegisteredUpload({ uploadedMonths }: { uploadedMonths: { month: string; quantity: number }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFile = async (file: File) => {
    setUploading(true);
    setErrors([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/finished-forecast/registered", { method: "POST", body: formData });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.message ?? "Tải file thất bại");
        setErrors(json?.errors ?? []);
        return;
      }
      toast.success(`Đã lưu số đăng ký tháng ${(json.months as { month: string }[]).map((m) => fmtMonth(m.month)).join(", ")}`);
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Tải số đăng ký sản xuất</p>
            <p className="text-sm text-text-secondary">
              File cần 3 cột Mã cây, Tháng, Số lượng. Tháng có trong file sẽ thay số cũ của tháng đó.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/api/finished-forecast/registered">
              <Button type="button" variant="outline" size="sm"><Download className="w-4 h-4 mr-1.5" /> Tải file mẫu</Button>
            </a>
            <Button type="button" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />} Tải file lên
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
          </div>
        </div>
        {uploadedMonths.length > 0 && (
          <p className="text-sm text-text-secondary">
            Đã tải: {uploadedMonths.map((m) => `${fmtMonth(m.month)} (${m.quantity.toLocaleString("vi-VN")} cây)`).join(" · ")}
          </p>
        )}
        {errors.length > 0 && (
          <ul className="text-sm text-destructive space-y-0.5">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
