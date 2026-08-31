"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type ForecastPlantTypeRow = { plantTypeId: string; code: string; name: string; quantity: number | null };
type ForecastStatus = {
  taskMonth: string;
  deadline: string;
  plantTypes: ForecastPlantTypeRow[];
  isComplete: boolean;
  completedAt: string | null;
  isOnTime: boolean | null;
};

function StatusBadge({ status }: { status: ForecastStatus }) {
  const deadline = new Date(status.deadline);
  const isPastDeadline = new Date() >= deadline;

  if (status.isComplete) {
    return status.isOnTime ? (
      <Badge variant="completed">Đã hoàn thành — Đúng hạn</Badge>
    ) : (
      <Badge variant="overdue">Đã hoàn thành — Trễ hạn</Badge>
    );
  }
  return isPastDeadline ? (
    <Badge variant="overdue">Quá hạn — Chưa hoàn thành</Badge>
  ) : (
    <Badge variant="info">Đang chờ nhập</Badge>
  );
}

export default function RootingForecastBoard() {
  const [status, setStatus] = useState<ForecastStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rooting-forecast");
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Không tải được dữ liệu");
        return;
      }
      setStatus(data);
      setValues(Object.fromEntries(data.plantTypes.map((p: ForecastPlantTypeRow) => [p.plantTypeId, p.quantity?.toString() ?? ""])));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveRow = async (plantTypeId: string) => {
    const raw = values[plantTypeId] ?? "";
    const quantity = Number(raw);
    if (raw.trim() === "" || !Number.isInteger(quantity) || quantity < 0) {
      toast.error("Nhập số lượng hợp lệ (số nguyên, không âm)");
      return;
    }
    setSavingId(plantTypeId);
    try {
      const res = await fetch("/api/rooting-forecast", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantTypeId, quantity }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "Lưu thất bại");
        return;
      }
      setStatus(data);
      toast.success("Đã lưu");
    } finally {
      setSavingId(null);
    }
  };

  const filledCount = useMemo(
    () => (status ? status.plantTypes.filter((p) => p.quantity !== null).length : 0),
    [status]
  );

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (error) {
    return (
      <Card><CardContent className="py-12 text-center text-text-secondary">{error}</CardContent></Card>
    );
  }

  if (!status) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <p className="text-sm text-text-secondary">
              Kỳ dự báo: <strong className="text-foreground">tháng {format(new Date(status.deadline), "MM/yyyy")} tới</strong>
              {" "}· Hạn hoàn thành: <strong className="text-foreground">{format(new Date(status.deadline), "dd/MM/yyyy")}</strong>
              {" "}· Đã điền {filledCount}/{status.plantTypes.length} mã cây
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        {status.plantTypes.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">
            Cơ sở sản xuất của bạn hiện chưa có mã cây nào đang hoạt động
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light text-primary-strong">
                  <th className="px-3 py-2 text-left font-bold text-base">Mã cây</th>
                  <th className="px-3 py-2 text-left font-bold text-base">Tên cây</th>
                  <th className="px-3 py-2 text-center font-bold text-base">Số lượng cây ra rễ đáp ứng</th>
                  <th className="px-3 py-2 text-center font-bold text-base">Lưu</th>
                </tr>
              </thead>
              <tbody>
                {status.plantTypes.map((p) => (
                  <tr key={p.plantTypeId} className="border-b last:border-0 even:bg-primary-light">
                    <td className="px-3 py-2 font-mono">{p.code}</td>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-2 py-2">
                      <Input
                        type="number" min={0}
                        value={values[p.plantTypeId] ?? ""}
                        onChange={(e) => setValues((prev) => ({ ...prev, [p.plantTypeId]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRow(p.plantTypeId); }}
                        className="w-32 text-center mx-auto block [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Button
                        type="button" size="icon-sm" variant="outline"
                        disabled={savingId === p.plantTypeId}
                        onClick={() => saveRow(p.plantTypeId)}
                      >
                        {savingId === p.plantTypeId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
