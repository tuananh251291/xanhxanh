"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { vi } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PackageCheck, Loader2, Sprout } from "lucide-react";

type PendingInstruction = {
  id: string;
  code: string;
  plantTypeCode: string;
  plantTypeName: string;
  inputMotherQuantity: number;
  weekStart: string | null;
};

export default function MotherReceiveList({ instructions }: { instructions: PendingInstruction[] }) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const confirm = async (inst: PendingInstruction) => {
    const ok = window.confirm(
      `Xác nhận đã nhận ${inst.inputMotherQuantity.toLocaleString("vi-VN")} mẫu mẹ cho chỉ định ${inst.code}?`
    );
    if (!ok) return;
    setConfirmingId(inst.id);
    try {
      const res = await fetch(`/api/instructions/${inst.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmMotherReceived: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success(`Đã xác nhận nhận mẫu mẹ cho chỉ định ${inst.code}!`);
      router.refresh();
    } finally {
      setConfirmingId(null);
    }
  };

  if (instructions.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-text-muted">
          <PackageCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Không có mẫu mẹ nào cần nhận hôm nay</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {instructions.map((inst) => (
        <Card key={inst.id} className="border-2 border-primary-light">
          <CardContent className="py-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-primary-light text-primary-strong shrink-0">
                <Sprout className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-text-secondary font-mono">{inst.code}</p>
                <p className="text-lg font-bold text-foreground truncate">
                  <span className="font-mono">{inst.plantTypeCode}</span> — {inst.plantTypeName}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background rounded-xl p-3">
                <p className="text-xs text-text-secondary">Số lô mẫu mẹ</p>
                <p className="text-xl font-bold text-primary-strong">
                  {inst.inputMotherQuantity.toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="bg-background rounded-xl p-3">
                <p className="text-xs text-text-secondary">Tuần cấy</p>
                <p className="text-sm font-semibold text-foreground">
                  {inst.weekStart
                    ? `${format(new Date(inst.weekStart), "dd/MM", { locale: vi })} – ${format(addDays(new Date(inst.weekStart), 6), "dd/MM", { locale: vi })}`
                    : "—"}
                </p>
              </div>
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary-hover"
              disabled={confirmingId === inst.id}
              onClick={() => confirm(inst)}
            >
              {confirmingId === inst.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Xác nhận bàn giao
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
