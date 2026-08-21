"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, addWeeks, addDays, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { ROLE_LABELS } from "@/types";
import WarehouseFilterSelect from "@/components/shared/warehouse-filter-select";

type TaskCompletionDay = {
  date: string;
  missedTasks: string[];
  exempted: boolean;
  exemptionReason: string | null;
};

type StaffRow = {
  staffId: string;
  staffCode: string;
  staffName: string;
  role: "KY_THUAT" | "CAY_MO" | "KHO_MO";
  notCompletedCount: number;
  days: TaskCompletionDay[];
};

const ROLE_FILTERS = ["all", "KY_THUAT", "CAY_MO", "KHO_MO"] as const;

export default function TaskCompletionReportBoard({
  isAdmin,
  canFilterByWarehouse = false,
}: {
  isAdmin: boolean;
  canFilterByWarehouse?: boolean;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_FILTERS)[number]>("all");
  const [warehouseId, setWarehouseId] = useState("");
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exemptTarget, setExemptTarget] = useState<{ staffId: string; staffName: string; date: string } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ weekStart: format(weekStart, "yyyy-MM-dd") });
      if (warehouseId) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/task-completion-report?${params}`);
      const data = await res.json();
      setStaffList(Array.isArray(data.staff) ? data.staff : []);
    } finally {
      setLoading(false);
    }
  }, [weekStart, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const submitExemption = async () => {
    if (!exemptTarget || !reason.trim()) { toast.error("Cần nhập lý do"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/task-completion-exemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: exemptTarget.staffId, date: exemptTarget.date, reason: reason.trim() }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã miễn trừ ngày này");
      setExemptTarget(null);
      setReason("");
      load();
    } finally {
      setSaving(false);
    }
  };

  const undoExemption = async (staffId: string, date: string) => {
    const res = await fetch(`/api/task-completion-exemptions?staffId=${staffId}&date=${date}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
    toast.success("Đã bỏ miễn trừ");
    load();
  };

  const filtered = roleFilter === "all" ? staffList : staffList.filter((s) => s.role === roleFilter);
  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" onClick={() => setWeekStart((w) => addWeeks(w, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-foreground w-44 text-center">
              {format(weekStart, "dd/MM", { locale: vi })} — {format(weekEnd, "dd/MM/yyyy", { locale: vi })}
            </span>
            <Button size="icon" variant="outline" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Tuần này
          </Button>
          <div className="flex-1" />
          {canFilterByWarehouse && <WarehouseFilterSelect value={warehouseId} onChange={setWarehouseId} />}
          <div className="space-y-1">
            <Label className="text-xs">Vai trò</Label>
            <Select
              items={[
                { value: "all", label: "Mọi vai trò" },
                { value: "KY_THUAT", label: ROLE_LABELS.KY_THUAT },
                { value: "CAY_MO", label: ROLE_LABELS.CAY_MO },
                { value: "KHO_MO", label: ROLE_LABELS.KHO_MO },
              ]}
              value={roleFilter}
              onValueChange={(v) => setRoleFilter((v as (typeof ROLE_FILTERS)[number]) ?? "all")}
            >
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi vai trò</SelectItem>
                <SelectItem value="KY_THUAT">{ROLE_LABELS.KY_THUAT}</SelectItem>
                <SelectItem value="CAY_MO">{ROLE_LABELS.CAY_MO}</SelectItem>
                <SelectItem value="KHO_MO">{ROLE_LABELS.KHO_MO}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-success-foreground" />
          <p>Không có nhân sự nào trong phạm vi xem của bạn</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Vai trò</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên NV</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số ngày không hoàn thành</th>
                    <th className="px-4 py-3 font-bold text-base"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <Fragment key={s.staffId}>
                      <tr className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                        <td className="px-4 py-3 text-text-secondary">{ROLE_LABELS[s.role]}</td>
                        <td className="px-4 py-3 font-mono text-text-secondary">{s.staffCode}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{s.staffName}</td>
                        <td className="px-4 py-3 text-right">
                          <Badge className={s.notCompletedCount > 0 ? "bg-danger-light text-destructive" : "bg-primary-light text-primary-strong"}>
                            {s.notCompletedCount.toLocaleString("vi-VN")} ngày
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === s.staffId ? null : s.staffId)}>
                            {expandedId === s.staffId ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </td>
                      </tr>
                      {expandedId === s.staffId && (
                        <tr className="border-b last:border-0">
                          <td colSpan={5} className="px-4 py-3 bg-background">
                            {s.days.length === 0 ? (
                              <p className="text-xs text-text-muted px-1">Chưa có ngày nào tới hạn đánh giá trong tuần này</p>
                            ) : (
                              <div className="rounded-lg border border-divider divide-y divide-divider">
                                {s.days.map((d) => {
                                  const notCompleted = d.missedTasks.length > 0;
                                  return (
                                    <div key={d.date} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                                      <span className="text-text-secondary whitespace-nowrap w-24">
                                        {format(parseISO(d.date), "EEEE dd/MM", { locale: vi })}
                                      </span>
                                      {d.exempted ? (
                                        <Badge className="bg-violet-light text-violet-foreground">Đã miễn trừ — {d.exemptionReason}</Badge>
                                      ) : notCompleted ? (
                                        <Badge className="bg-danger-light text-destructive">{d.missedTasks.join(", ")}</Badge>
                                      ) : (
                                        <Badge className="bg-primary-light text-primary-strong">Đã hoàn thành</Badge>
                                      )}
                                      {isAdmin && (
                                        d.exempted ? (
                                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => undoExemption(s.staffId, d.date)}>
                                            <X className="w-3 h-3 mr-1" /> Bỏ miễn trừ
                                          </Button>
                                        ) : notCompleted ? (
                                          <Button
                                            size="sm" variant="ghost" className="h-6 px-2 text-xs"
                                            onClick={() => { setExemptTarget({ staffId: s.staffId, staffName: s.staffName, date: d.date }); setReason(""); }}
                                          >
                                            <ShieldOff className="w-3 h-3 mr-1" /> Miễn trừ
                                          </Button>
                                        ) : null
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!exemptTarget} onOpenChange={(open) => { if (!open) setExemptTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Miễn trừ ngày không hoàn thành</DialogTitle></DialogHeader>
          {exemptTarget && (
            <div className="space-y-3 mt-2">
              <p className="text-sm text-text-secondary">
                {exemptTarget.staffName} — ngày {format(parseISO(exemptTarget.date), "EEEE dd/MM/yyyy", { locale: vi })}
              </p>
              <div className="space-y-1">
                <Label className="text-sm">Lý do *</Label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="VD: nghỉ phép, nghỉ ốm có xin phép..."
                  rows={3}
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setExemptTarget(null)}>Hủy</Button>
                <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={saving} onClick={submitExemption}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Xác nhận miễn trừ
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
