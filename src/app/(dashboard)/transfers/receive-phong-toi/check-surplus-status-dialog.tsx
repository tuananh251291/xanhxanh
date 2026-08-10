"use client";

import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PackageSearch, Loader2, CheckCircle2 } from "lucide-react";

type StaffSurplus = {
  staffId: string;
  staffCode: string;
  staffName: string;
  candidates: { id: string; code: string; surplus: number }[];
};

export default function CheckSurplusStatusDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [staffList, setStaffList] = useState<StaffSurplus[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transfers/surplus-handover-status");
      const json = await res.json();
      setStaffList(Array.isArray(json.staffList) ? json.staffList : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const totalInstructions = staffList.reduce((s, st) => s + st.candidates.length, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" className="bg-primary hover:bg-primary-hover" />}>
        <PackageSearch className="w-4 h-4 mr-2" /> Kiểm tra tình trạng MM dư
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageSearch className="w-5 h-5" /> Kiểm tra tình trạng MM dư
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-text-secondary">
            Chỉ định cấy đã kết thúc (hết tuần/tự kết thúc sớm), NV đã nhận mẫu mẹ, còn dư mà chưa bàn
            giao lên kho sáng.
          </p>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
          ) : staffList.length === 0 ? (
            <div className="py-10 text-center text-text-muted">
              <CheckCircle2 className="w-9 h-9 mx-auto mb-2 text-success-foreground" />
              <p>Không có chỉ định nào còn MM dư chưa bàn giao</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">
                <strong className="text-destructive">{staffList.length}</strong> nhân viên với{" "}
                <strong className="text-destructive">{totalInstructions}</strong> chỉ định còn MM dư chưa bàn giao:
              </p>
              <div className="max-h-96 overflow-y-auto border border-divider rounded-lg divide-y divide-divider">
                {staffList.map((s) => (
                  <div key={s.staffId} className="px-3 py-2 space-y-1">
                    <div>
                      <span className="font-mono text-xs text-text-secondary mr-2">{s.staffCode}</span>
                      <span className="text-sm font-medium text-foreground">{s.staffName}</span>
                    </div>
                    <div className="space-y-0.5">
                      {s.candidates.map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-xs pl-1">
                          <span className="font-mono text-text-secondary">{c.code}</span>
                          <span className="text-warning-foreground font-medium">
                            dư {c.surplus.toLocaleString("vi-VN")} cụm
                          </span>
                        </div>
                      ))}
                    </div>
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
