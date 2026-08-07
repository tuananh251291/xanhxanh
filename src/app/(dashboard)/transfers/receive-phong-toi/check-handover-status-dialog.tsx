"use client";

import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Loader2, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { INSPECTION_LANE_LABELS, INSPECTION_LANE_COLORS } from "@/types";

type MissingStaff = { id: string; code: string; name: string; inspectionLane: "XANH" | "DO" | null };

export default function CheckHandoverStatusDialog() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [totalStaff, setTotalStaff] = useState(0);
  const [missingStaff, setMissingStaff] = useState<MissingStaff[]>([]);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transfers/handover-status?date=${d}`);
      const json = await res.json();
      setTotalStaff(json.totalStaff ?? 0);
      setMissingStaff(Array.isArray(json.missingStaff) ? json.missingStaff : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(date); }, [open, date, load]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <ClipboardCheck className="w-4 h-4 mr-2" /> Kiểm tra tình trạng bàn giao
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" /> Kiểm tra tình trạng bàn giao
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label className="text-xs">Chọn ngày</Label>
            <Input
              type="date"
              value={date}
              max={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setDate(e.target.value)}
              className="w-48"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
          ) : missingStaff.length === 0 ? (
            <div className="py-10 text-center text-text-muted">
              <CheckCircle2 className="w-9 h-9 mx-auto mb-2 text-success-foreground" />
              <p>Tất cả {totalStaff} nhân viên cấy mô đã bàn giao ngày này</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">
                <strong className="text-destructive">{missingStaff.length}</strong>/{totalStaff} nhân viên chưa bàn giao:
              </p>
              <div className="max-h-72 overflow-y-auto border border-divider rounded-lg divide-y divide-divider">
                {missingStaff.map((s) => (
                  <div key={s.id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs text-text-secondary mr-2">{s.code}</span>
                      <span className="text-sm text-foreground">{s.name}</span>
                    </div>
                    {s.inspectionLane && (
                      <Badge className={INSPECTION_LANE_COLORS[s.inspectionLane]}>{INSPECTION_LANE_LABELS[s.inspectionLane]}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
