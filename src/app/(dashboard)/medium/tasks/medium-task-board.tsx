"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FlaskConical, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { MOTHER_SPEC_LABELS, MEDIUM_PURPOSE_LABELS, TRANSFER_STATUS_LABELS } from "@/types";

export type MediumTask = {
  key: string;
  instructionId: string;
  instructionCode: string;
  plantTypeName: string;
  assignedToId: string | null;
  assignedToName: string | null;
  status: string;
  stageCode: string | null;
  purpose: "MOTHER" | "FINISHED";
  quantity: number;
  mediumTypeId: string;
  mediumCode: string;
  mediumName: string;
};

type Handover = {
  id: string;
  code: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  toUser: { name: string };
  createdAt: string;
  items: { quantity: number; mediumType: { code: string }; instruction: { code: string } | null }[];
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default function MediumTaskBoard({ tasks }: { tasks: MediumTask[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loadingHandovers, setLoadingHandovers] = useState(true);

  const loadHandovers = useCallback(async () => {
    setLoadingHandovers(true);
    try {
      const res = await fetch("/api/medium-handovers");
      const data = await res.json();
      setHandovers(Array.isArray(data) ? data : []);
    } finally {
      setLoadingHandovers(false);
    }
  }, []);

  useEffect(() => { loadHandovers(); }, [loadHandovers]);

  const byMedium = new Map<string, { name: string; code: string; tasks: MediumTask[] }>();
  for (const t of tasks) {
    if (!byMedium.has(t.mediumCode)) byMedium.set(t.mediumCode, { name: t.mediumName, code: t.mediumCode, tasks: [] });
    byMedium.get(t.mediumCode)!.tasks.push(t);
  }
  const groups = Array.from(byMedium.values()).sort((a, b) => a.code.localeCompare(b.code));
  const totalQuantity = groups.reduce((s, g) => s + g.tasks.reduce((s2, t) => s2 + t.quantity, 0), 0);

  const tasksByKey = useMemo(() => new Map(tasks.map((t) => [t.key, t])), [tasks]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const submit = async () => {
    const selectedTasks = Array.from(selected).map((k) => tasksByKey.get(k)!).filter(Boolean);
    if (selectedTasks.length === 0) return;

    // 1 phiếu chỉ gửi cho 1 NV cấy — nhóm các nhiệm vụ đã chọn theo người phụ trách, tạo nhiều phiếu nếu cần.
    const byStaff = new Map<string, MediumTask[]>();
    for (const t of selectedTasks) {
      if (!t.assignedToId) continue;
      if (!byStaff.has(t.assignedToId)) byStaff.set(t.assignedToId, []);
      byStaff.get(t.assignedToId)!.push(t);
    }

    setSubmitting(true);
    try {
      let successCount = 0;
      for (const [toUserId, staffTasks] of byStaff) {
        const res = await fetch("/api/medium-handovers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toUserId,
            items: staffTasks.map((t) => ({
              mediumTypeId: t.mediumTypeId,
              instructionId: t.instructionId,
              purpose: t.purpose,
              quantity: t.quantity,
            })),
          }),
        });
        if (!res.ok) {
          const json = await res.json();
          toast.error(`Lỗi tạo phiếu cho ${staffTasks[0].assignedToName}: ${json.message ?? "Có lỗi xảy ra"}`);
          continue;
        }
        successCount++;
      }
      if (successCount > 0) {
        toast.success(`Đã tạo ${successCount} phiếu bàn giao môi trường`);
        setSelected(new Set());
        loadHandovers();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-cyan-600" /> Nhiệm vụ pha môi trường
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Tuần này · {groups.length} mã môi trường · {tasks.length} dòng quy cách nguồn · {totalQuantity.toLocaleString("vi-VN")} tổng số lượng cần pha
        </p>
      </div>

      {groups.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <FlaskConical className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Không có chỉ định cấy nào cần môi trường trong tuần này</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.code}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="font-mono text-cyan-700">{g.code}</span>
                    <span className="text-gray-500 font-normal">— {g.name}</span>
                  </CardTitle>
                  <Badge variant="secondary">{g.tasks.length} nhiệm vụ</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {g.tasks.map((t) => (
                    <label
                      key={t.key}
                      className={`flex items-center justify-between text-sm border-t first:border-t-0 py-1.5 ${t.assignedToId ? "cursor-pointer" : "opacity-60"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={selected.has(t.key)}
                          disabled={!t.assignedToId}
                          onCheckedChange={() => toggle(t.key)}
                        />
                        <span className="font-mono text-blue-700">{t.instructionCode}</span>
                        <span className="text-gray-600">{t.plantTypeName}</span>
                        {t.stageCode && (
                          <Badge variant="outline">
                            {MOTHER_SPEC_LABELS[t.stageCode as keyof typeof MOTHER_SPEC_LABELS] ?? t.stageCode}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{MEDIUM_PURPOSE_LABELS[t.purpose]}: <strong>{t.quantity.toLocaleString("vi-VN")}</strong></span>
                        <span>NV cấy: {t.assignedToName ?? "Chưa gán"}</span>
                        <Badge className={t.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                          {t.status === "ACTIVE" ? "Đang thực hiện" : "Nháp"}
                        </Badge>
                      </div>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Phiếu bàn giao đã tạo</CardTitle></CardHeader>
        <CardContent>
          {loadingHandovers ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : handovers.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Chưa tạo phiếu bàn giao nào</p>
          ) : (
            <div className="space-y-2">
              {handovers.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm border-t first:border-t-0 pt-2 first:pt-0">
                  <div>
                    <span className="font-mono font-medium text-cyan-700">{h.code}</span>
                    <span className="text-gray-600 ml-2">→ {h.toUser.name}</span>
                    <span className="text-gray-400 ml-2">{h.items.length} dòng · {h.items.reduce((s, i) => s + i.quantity, 0).toLocaleString("vi-VN")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{format(h.createdAt, "dd/MM HH:mm", { locale: vi })}</span>
                    <Badge className={STATUS_COLORS[h.status]}>{TRANSFER_STATUS_LABELS[h.status]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white shadow-lg border rounded-lg px-4 py-3 flex items-center gap-4 z-10">
          <span className="text-sm font-medium">{selected.size} nhiệm vụ đã chọn</span>
          <Button onClick={submit} disabled={submitting} className="bg-cyan-600 hover:bg-cyan-700">
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Tạo phiếu bàn giao
          </Button>
        </div>
      )}
    </div>
  );
}
