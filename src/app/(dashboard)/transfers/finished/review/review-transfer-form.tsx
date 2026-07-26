"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Layers, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { aggregateLotsByPlantType } from "@/lib/transfer-aggregate";
import TransferReceipt from "../transfer-receipt";
import type { ScannedShelf, CreatedTransfer } from "../types";

export default function ReviewTransferForm({
  khaDungRoomId, staffName, shelves,
}: {
  khaDungRoomId: string;
  staffName: string;
  shelves: ScannedShelf[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [createdTransfer, setCreatedTransfer] = useState<CreatedTransfer | null>(null);

  const allLots = shelves.flatMap((s) => s.lots);
  const aggregated = aggregateLotsByPlantType(allLots);
  const lotCount = allLots.length;

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toRoomId: khaDungRoomId,
          notes: `Giàn kệ: ${shelves.map((s) => s.code).join(", ")}`,
          items: allLots.map((l) => ({ lotId: l.id, quantity: l.quantity })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã tạo phiếu bàn giao thành phẩm");
      setCreatedTransfer({ id: json.id, code: json.code, transferredAt: json.transferredAt, shelves });
    } finally {
      setSubmitting(false);
    }
  };

  if (createdTransfer) {
    return (
      <TransferReceipt
        transfer={createdTransfer}
        staffName={staffName}
        onCreateNew={() => router.push("/transfers/finished")}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/transfers/finished")} title="Quay lại">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary-strong" /> Xem trước bàn giao thành phẩm
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {shelves.length} kệ · {lotCount} lô — kiểm tra tổng hợp bên dưới trước khi xác nhận bàn giao cho Kho thành phẩm
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Giàn kệ đã chọn</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {shelves.map((s) => (
            <Badge key={s.id} variant="secondary" className="font-mono">{s.code}</Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tổng hợp theo loại cây</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {aggregated.length === 0 ? (
            <p className="px-6 py-10 text-center text-text-muted">Các kệ đã chọn không có thành phẩm nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-6 py-4 text-primary-strong font-bold text-lg">Mã cây</th>
                    <th className="text-left px-6 py-4 text-primary-strong font-bold text-lg">Loại cây</th>
                    <th className="text-right px-6 py-4 text-primary-strong font-bold text-lg">T01</th>
                    <th className="text-right px-6 py-4 text-primary-strong font-bold text-lg">T05</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregated.map((row) => (
                    <tr key={row.code} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-6 py-4 font-mono">{row.code}</td>
                      <td className="px-6 py-4">{row.name}</td>
                      <td className="px-6 py-4 text-right font-semibold">{row.t01.toLocaleString("vi-VN")}</td>
                      <td className="px-6 py-4 text-right font-semibold">{row.t05.toLocaleString("vi-VN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => router.push("/transfers/finished")} disabled={submitting}>
          Hủy, quay lại
        </Button>
        <Button className="flex-1 bg-primary hover:bg-primary-hover" onClick={submit} disabled={submitting || aggregated.length === 0}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Xác nhận bàn giao
        </Button>
      </div>
    </div>
  );
}
