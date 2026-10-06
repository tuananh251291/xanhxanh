"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Fingerprint, Loader2, LogIn, LogOut, MapPin, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { compressImageToDataUrl } from "@/lib/image-compress";
import {
  ATTENDANCE_SELFIE_COMPRESS_OPTIONS,
  type AttendanceDayCell,
  type AttendanceSummary,
} from "@/lib/attendance";
import type { AttendanceRequestStatus, AttendanceRequestType } from "@prisma/client";
import {
  ATTENDANCE_REQUEST_TYPE_LABELS,
  DAY_STATUS_LABEL,
  DAY_STATUS_STYLE,
  DayDetailDialog,
  RequestStatusBadge,
  dayShortCode,
  describeRequest,
  fmtDateKey,
  type RequestLike,
} from "./attendance-shared";
import RequestFormDialog from "./request-form-dialog";

type MyRequest = RequestLike & {
  id: string;
  status: AttendanceRequestStatus;
  reason: string;
  managerNote: string | null;
  hrNote: string | null;
  createdAt: string;
  manager: { name: string } | null;
  hr: { name: string } | null;
};

type MeData = {
  todayKey: string;
  month: string;
  warehouse: { id: string; name: string } | null;
  site: {
    configured: boolean;
    shiftStart: string; shiftEnd: string; breakStart: string | null; breakEnd: string | null;
    graceMinutes: number; radiusMeters: number;
  } | null;
  today: { checkIn: string | null; checkOut: string | null; lateMinutes: number; earlyMinutes: number } | null;
  days: AttendanceDayCell[];
  summary: AttendanceSummary | null;
  leave: { total: number; used: number; pending: number; remaining: number };
  requests: MyRequest[];
};

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Thiết bị không hỗ trợ định vị GPS")); return; }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      reject(new Error(
        err.code === err.PERMISSION_DENIED
          ? "Bạn chưa cho phép truy cập vị trí — bật quyền Vị trí cho trình duyệt rồi thử lại"
          : "Không lấy được vị trí GPS — thử ra chỗ thoáng rồi chấm lại"
      ));
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

export default function AttendanceBoard({ userId, userName, initialTab }: { userId: string; userName: string; initialTab: "calendar" | "requests" }) {
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<"IN" | "OUT" | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [formPreset, setFormPreset] = useState<{ type?: AttendanceRequestType; date?: string }>({});
  const [detail, setDetail] = useState<{ userId: string; userName: string; date: string } | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<{ action: "IN" | "OUT"; position: Promise<GeolocationPosition> } | null>(null);

  // Không tự bật loading ở đây (gọi từ effect) — nút đổi tháng tự bật trước khi gọi.
  const load = useCallback(async (m: string | null) => {
    try {
      const res = await fetch(`/api/attendance/me${m ? `?month=${m}` : ""}`);
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Không tải được dữ liệu"); return; }
      setData(json);
      setMonth(json.month);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(null); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Bấm nút → mở camera trước (phải gọi trong đúng thao tác bấm, iOS mới cho mở) và lấy GPS song song.
  const startCheck = (action: "IN" | "OUT") => {
    const position = getPosition();
    position.catch(() => null); // tránh unhandled rejection nếu NV huỷ chụp
    pendingRef.current = { action, position };
    if (cameraRef.current) {
      cameraRef.current.value = "";
      cameraRef.current.click();
    }
  };

  const handleSelfie = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const pending = pendingRef.current;
    if (!file || !pending) return;
    setChecking(pending.action);
    try {
      const [pos, image] = await Promise.all([pending.position, compressImageToDataUrl(file, ATTENDANCE_SELFIE_COMPRESS_OPTIONS)]);
      const res = await fetch("/api/attendance/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: pending.action,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          image,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Chấm công thất bại"); return; }
      if (pending.action === "IN") {
        toast.success(json.lateMinutes > 0 ? `Đã chấm vào lúc ${json.time} — muộn ${json.lateMinutes} phút` : `Đã chấm vào lúc ${json.time}`);
      } else {
        toast.success(json.earlyMinutes > 0 ? `Đã chấm ra lúc ${json.time} — sớm ${json.earlyMinutes} phút` : `Đã chấm ra lúc ${json.time}`);
      }
      load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chấm công thất bại");
    } finally {
      setChecking(null);
      pendingRef.current = null;
    }
  };

  const cancelRequest = async (id: string) => {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/attendance/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL" }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Huỷ đơn thất bại"); return; }
      toast.success("Đã huỷ đơn");
      load(month);
    } finally {
      setCancellingId(null);
    }
  };

  const openForm = (preset: { type?: AttendanceRequestType; date?: string } = {}) => {
    setFormPreset(preset);
    setFormOpen(true);
  };

  if (!data) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  const { site, today, summary } = data;
  const canCheck = !!data.warehouse && !!site?.configured;
  const clock = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
  const dateLabel = now.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });

  // Lưới lịch: ô trống trước ngày 1 (tuần bắt đầu Thứ 2).
  const firstWeekday = data.days.length ? (new Date(`${data.days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const needExplain = data.days.filter((d) => (d.status === "MISSING_IN" || d.status === "MISSING_OUT" || d.status === "ABSENT") && d.date < data.todayKey);
  const pendingCount = data.requests.filter((r) => r.status === "PENDING_MANAGER" || r.status === "PENDING_HR").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Fingerprint className="w-6 h-6 text-primary-strong" /> Chấm công
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {data.warehouse ? data.warehouse.name : "Chưa được gắn khu làm việc"}
          {site && ` · Ca ${site.shiftStart} – ${site.shiftEnd}`}
          {site?.breakStart && site.breakEnd && ` · Nghỉ trưa ${site.breakStart} – ${site.breakEnd}`}
        </p>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleSelfie} />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="text-center space-y-1">
            <p className="text-4xl font-bold text-foreground tabular-nums">{clock}</p>
            <p className="text-sm text-text-secondary capitalize">{dateLabel}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-xs text-text-secondary">Giờ vào</p>
              <p className="text-xl font-semibold text-foreground">{today?.checkIn ?? "--:--"}</p>
              {!!today?.lateMinutes && <p className="text-xs text-warning-foreground">Muộn {today.lateMinutes} phút</p>}
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-xs text-text-secondary">Giờ ra</p>
              <p className="text-xl font-semibold text-foreground">{today?.checkOut ?? "--:--"}</p>
              {!!today?.earlyMinutes && <p className="text-xs text-warning-foreground">Sớm {today.earlyMinutes} phút</p>}
            </div>
          </div>

          {!canCheck ? (
            <p className="text-center text-sm text-destructive">
              {!data.warehouse
                ? "Bạn chưa được gắn khu làm việc — liên hệ HCNS."
                : "HCNS chưa cài vị trí chấm công cho khu của bạn."}
            </p>
          ) : (
            <div className="flex justify-center gap-3">
              {!today?.checkIn ? (
                <Button size="lg" className="min-w-40 h-12 text-base" disabled={!!checking} onClick={() => startCheck("IN")}>
                  {checking === "IN" ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />} Chấm vào
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant={today.checkOut ? "outline" : "default"}
                  className="min-w-40 h-12 text-base"
                  disabled={!!checking}
                  onClick={() => startCheck("OUT")}
                >
                  {checking === "OUT" ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                  {today.checkOut ? "Chấm ra lại" : "Chấm ra"}
                </Button>
              )}
            </div>
          )}
          <p className="text-center text-xs text-text-muted flex items-center justify-center gap-1">
            <MapPin className="w-3 h-3" /> Cần bật định vị và đứng trong phạm vi {site?.radiusMeters ?? "—"}m của khu · chụp 1 ảnh selfie khi chấm
          </p>
        </CardContent>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Công tháng này", value: summary.workUnits, tone: "text-primary-strong" },
            { label: "Phép năm còn lại", value: data.leave.remaining, tone: "text-info-foreground" },
            { label: "Đi muộn", value: `${summary.lateCount} lần`, sub: summary.lateMinutes ? `${summary.lateMinutes} phút` : undefined, tone: "text-warning-foreground" },
            { label: "Thiếu chấm", value: summary.missingCount, tone: "text-warning-foreground" },
            { label: "Vắng không phép", value: summary.absentCount, tone: "text-destructive" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="py-3">
                <p className="text-xs text-text-secondary">{s.label}</p>
                <p className={cn("text-2xl font-bold", s.tone)}>{s.value}</p>
                {s.sub && <p className="text-xs text-text-muted">{s.sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="calendar">Bảng công</TabsTrigger>
          <TabsTrigger value="requests">Đơn từ{pendingCount > 0 ? ` (${pendingCount})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => { if (month) { setLoading(true); load(shiftMonth(month, -1)); } }} disabled={loading}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <CardTitle className="text-base">
                  Tháng {month?.slice(5)}/{month?.slice(0, 4)} {loading && <Loader2 className="inline w-4 h-4 animate-spin ml-1" />}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { if (month) { setLoading(true); load(shiftMonth(month, 1)); } }} disabled={loading || (month ?? "") >= data.todayKey.slice(0, 7)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((w) => <div key={w} className="text-xs font-semibold text-text-secondary py-1">{w}</div>)}
                {Array.from({ length: firstWeekday }, (_, i) => <div key={`e${i}`} />)}
                {data.days.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setDetail({ userId, userName, date: d.date })}
                    className={cn(
                      "rounded-md min-h-14 p-1 text-left flex flex-col border border-divider hover:ring-2 hover:ring-ring transition",
                      DAY_STATUS_STYLE[d.status],
                      d.date === data.todayKey && "ring-2 ring-primary"
                    )}
                  >
                    <span className="text-xs font-semibold">{Number(d.date.slice(8))}</span>
                    {d.checkIn && <span className="text-[0.65rem] leading-tight">{d.checkIn}{d.checkOut ? `–${d.checkOut}` : ""}</span>}
                    {!d.checkIn && dayShortCode(d) && <span className="text-[0.7rem] font-semibold">{dayShortCode(d)}</span>}
                    {(d.lateMinutes > 0 || d.earlyMinutes > 0) && <span className="text-[0.6rem] text-warning-foreground">⏱ {d.lateMinutes + d.earlyMinutes}′</span>}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {(["WORK", "LEAVE", "MISSING_OUT", "ABSENT", "HOLIDAY", "OFF"] as const).map((s) => (
                  <span key={s} className={cn("rounded px-2 py-0.5", DAY_STATUS_STYLE[s])}>{s === "MISSING_OUT" ? "Thiếu chấm" : DAY_STATUS_LABEL[s]}</span>
                ))}
              </div>
            </CardContent>
          </Card>

          {needExplain.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Ngày cần giải trình</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {needExplain.map((d) => (
                  <div key={d.date} className="flex items-center justify-between gap-2 rounded-md border border-divider px-3 py-2 text-sm">
                    <span>
                      {fmtDateKey(d.date)} · <span className={cn("rounded px-1.5 py-0.5 text-xs", DAY_STATUS_STYLE[d.status])}>{DAY_STATUS_LABEL[d.status]}</span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => openForm({ type: d.status === "ABSENT" ? "ANNUAL_LEAVE" : "MISSED_CHECK", date: d.date })}>
                      {d.status === "ABSENT" ? "Xin nghỉ bù" : "Quên chấm công"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="requests" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-text-secondary">
              Phép năm: tổng {data.leave.total} · đã dùng {data.leave.used} · đang chờ {data.leave.pending} · <b className="text-foreground">còn {data.leave.remaining}</b>
            </p>
            <Button onClick={() => openForm()}><Plus className="w-4 h-4" /> Tạo đơn</Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Loại đơn</th>
                    <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Nội dung</th>
                    <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Trạng thái</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.requests.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-text-muted">Chưa có đơn nào</td></tr>
                  ) : data.requests.map((r) => (
                    <tr key={r.id} className="border-b border-divider last:border-0 align-top">
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-foreground">{ATTENDANCE_REQUEST_TYPE_LABELS[r.type]}</td>
                      <td className="px-3 py-2 text-text-secondary">
                        <p>{describeRequest(r)}</p>
                        <p className="text-xs text-text-muted">Lý do: {r.reason}</p>
                        {r.managerNote && <p className="text-xs text-text-muted">Quản lý{r.manager ? ` ${r.manager.name}` : ""}: {r.managerNote}</p>}
                        {r.hrNote && <p className="text-xs text-text-muted">HCNS{r.hr ? ` ${r.hr.name}` : ""}: {r.hrNote}</p>}
                      </td>
                      <td className="px-3 py-2"><RequestStatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-right">
                        {(r.status === "PENDING_MANAGER" || r.status === "PENDING_HR") && (
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={cancellingId === r.id} onClick={() => cancelRequest(r.id)}>
                            {cancellingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Huỷ
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <p className="text-xs text-text-muted flex items-center gap-1">
            <Clock className="w-3 h-3" /> Đơn được quản lý khu duyệt trước, sau đó HCNS duyệt.
          </p>
        </TabsContent>
      </Tabs>

      <RequestFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        todayKey={data.todayKey}
        remainingAnnualLeave={data.leave.remaining}
        onCreated={() => load(month)}
        initialType={formPreset.type}
        initialDate={formPreset.date}
      />
      <DayDetailDialog target={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
