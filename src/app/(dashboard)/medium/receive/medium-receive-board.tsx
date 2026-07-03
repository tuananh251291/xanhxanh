"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlaskConical, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { MEDIUM_PURPOSE_LABELS } from "@/types";

type HandoverItem = {
  id: string;
  quantity: number;
  purpose: "MOTHER" | "FINISHED";
  mediumType: { code: string; name: string };
  instruction: { code: string } | null;
};
type Handover = {
  id: string;
  code: string;
  status: string;
  fromUser: { name: string };
  createdAt: string;
  notes: string | null;
  items: HandoverItem[];
};

export default function MediumReceiveBoard() {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/medium-handovers?status=PENDING");
      const data = await res.json();
      setHandovers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const act = async (id: string, action: "confirm" | "reject") => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/medium-handovers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(action === "confirm" ? "Đã xác nhận nhận môi trường" : "Đã từ chối phiếu");
      loadData();
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-cyan-600" /> Nhận môi trường
        </h1>
        <p className="text-gray-500 text-sm mt-1">{handovers.length} phiếu chờ xác nhận</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : handovers.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <FlaskConical className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Không có phiếu bàn giao môi trường nào đang chờ</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {handovers.map((h) => (
            <Card key={h.id} className="border-l-4 border-l-cyan-500">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-cyan-700">{h.code}</span>
                      <Badge className="bg-yellow-100 text-yellow-700">Chờ xác nhận</Badge>
                    </div>
                    <p className="text-sm text-gray-600">Từ: <strong>{h.fromUser.name}</strong></p>
                    <p className="text-xs text-gray-400">{format(h.createdAt, "dd/MM/yyyy HH:mm", { locale: vi })}</p>
                    {h.notes && <p className="text-sm text-gray-500 mt-1">Ghi chú: {h.notes}</p>}
                  </div>
                </div>

                <div className="space-y-1 border-t pt-2">
                  {h.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-cyan-700">{item.mediumType.code}</span>
                        <span className="text-gray-500">{item.mediumType.name}</span>
                        {item.instruction && (
                          <Badge variant="outline" className="text-xs">{item.instruction.code}</Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {MEDIUM_PURPOSE_LABELS[item.purpose]}: <strong>{item.quantity.toLocaleString("vi-VN")}</strong>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600"
                    onClick={() => act(h.id, "reject")}
                    disabled={processing === h.id}
                  >
                    <X className="w-4 h-4 mr-1" /> Từ chối
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => act(h.id, "confirm")}
                    disabled={processing === h.id}
                  >
                    {processing === h.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                    Xác nhận nhận môi trường
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
