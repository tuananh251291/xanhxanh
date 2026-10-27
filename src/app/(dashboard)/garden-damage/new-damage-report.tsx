"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

// Mở phiếu ghi nhận cây hỏng mới từ 1 phiếu bàn giao đã nhận vào kho vườn (luồng A/B tự theo loại lệnh).
export default function NewDamageReport({ receipts }: { receipts: { id: string; label: string }[] }) {
  const router = useRouter();
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!receiptId) { toast.error("Chọn phiếu bàn giao"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/garden-damage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId }) });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Có lỗi xảy ra");
        if (json.id) router.push(`/garden-damage/${json.id}`);
        return;
      }
      toast.success(`Đã mở phiếu ${json.code}`);
      router.push(`/garden-damage/${json.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Mở phiếu ghi nhận cây hỏng</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        {receipts.length === 0 ? (
          <p className="text-sm text-text-muted">Chưa có phiếu bàn giao nào đã nhận vào kho vườn (hoặc các phiếu đều đang có phiếu hỏng chưa xác nhận).</p>
        ) : (
          <>
            <Select items={receipts.map((r) => ({ value: r.id, label: r.label }))} value={receiptId} onValueChange={(v) => setReceiptId(v as string)}>
              <SelectTrigger className="w-full sm:w-[36rem]"><SelectValue placeholder="Chọn phiếu bàn giao ban đầu" /></SelectTrigger>
              <SelectContent>
                {receipts.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={create} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />} Mở phiếu</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
