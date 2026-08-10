"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Loader2, CheckCircle2, Calendar as CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { vi } from "date-fns/locale";
import { INSPECTION_LANE_LABELS, INSPECTION_LANE_COLORS } from "@/types";

type MissingStaff = { id: string; code: string; name: string; inspectionLane: "XANH" | "DO" | null };

export default function CheckHandoverStatusDialog() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [totalWithEntries, setTotalWithEntries] = useState(0);
  const [missingStaff, setMissingStaff] = useState<MissingStaff[]>([]);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transfers/handover-status?date=${d}`);
      const json = await res.json();
      setTotalWithEntries(json.totalWithEntries ?? 0);
      setMissingStaff(Array.isArray(json.missingStaff) ? json.missingStaff : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(date); }, [open, date, load]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" className="bg-primary hover:bg-primary-hover" />}>
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
            <Label className="text-xs">Ngày nhập kho tối</Label>
            {/* Trình duyệt (Chromium) luôn hiện ô <input type="date"> dạng MM/DD/YYYY bất kể lang/locale
                nào, gõ tay rất dễ nhầm ngày/tháng — ẩn hẳn ô gõ tay, chỉ cho chọn qua lịch bật lên bằng
                showPicker() (khớp đúng ngày người dùng bấm chọn), hiển thị lại đúng dd/MM/yyyy quen thuộc
                trên nút bấm. */}
            <button
              type="button"
              onClick={() => {
                const input = dateInputRef.current;
                if (!input) return;
                if (typeof input.showPicker === "function") input.showPicker();
                else input.click();
              }}
              className="w-48 h-9 md:h-8 px-2.5 flex items-center justify-between gap-2 rounded-lg border border-input bg-transparent text-sm hover:bg-primary-light transition-colors"
            >
              <span className="text-foreground">{format(parse(date, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: vi })}</span>
              <CalendarIcon className="w-4 h-4 text-text-muted shrink-0" />
            </button>
            <Input
              ref={dateInputRef}
              type="date"
              value={date}
              max={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setDate(e.target.value)}
              tabIndex={-1}
              className="sr-only"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
          ) : totalWithEntries === 0 ? (
            <div className="py-10 text-center text-text-muted">
              <p>Không có lô nào nhập kho tối vào ngày này</p>
            </div>
          ) : missingStaff.length === 0 ? (
            <div className="py-10 text-center text-text-muted">
              <CheckCircle2 className="w-9 h-9 mx-auto mb-2 text-success-foreground" />
              <p>Cả {totalWithEntries} nhân viên đã bàn giao đủ lô nhập kho tối ngày này</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">
                <strong className="text-destructive">{missingStaff.length}</strong>/{totalWithEntries} nhân viên chưa bàn giao lô nhập kho tối ngày này:
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
