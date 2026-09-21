"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type ErrorType = { id: string; label: string; createdAt: string; createdBy: { name: string; code: string } };

export default function PlantingErrorTypesBoard() {
  const [types, setTypes] = useState<ErrorType[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/planting-error-types");
      const data = await res.json();
      setTypes(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addType = async () => {
    if (!newLabel.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/planting-error-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã thêm loại lỗi cấy");
      setNewLabel("");
      load();
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Nhập tên loại lỗi cấy mới…"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addType(); }}
              className="flex-1 min-w-[220px]"
            />
            <Button onClick={addType} disabled={adding || !newLabel.trim()} className="bg-primary hover:bg-primary-hover shrink-0">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Thêm
            </Button>
          </div>

          {types.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Chưa có loại lỗi cấy nào</p>
          ) : (
            <div className="rounded-lg border border-divider divide-y divide-divider">
              {types.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                  <Tag className="w-4 h-4 text-primary-strong shrink-0" />
                  <span className="text-foreground flex-1">{t.label}</span>
                  <span className="text-xs text-text-muted whitespace-nowrap">
                    {t.createdBy.name} ({t.createdBy.code}) · {format(new Date(t.createdAt), "dd/MM/yyyy", { locale: vi })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
