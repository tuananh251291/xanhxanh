"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ATTENDANCE_REQUEST_STATUS_LABELS,
  ATTENDANCE_REQUEST_TYPE_LABELS,
  DAY_PORTION_LABELS,
  type AttendanceDayCell,
  type AttendanceDayStatus,
} from "@/lib/attendance";
import type { AttendanceDayPortion, AttendanceRequestStatus, AttendanceRequestType } from "@prisma/client";

export const DAY_STATUS_STYLE: Record<AttendanceDayStatus, string> = {
  WORK: "bg-primary-light text-primary-strong",
  LEAVE: "bg-info-light text-info-foreground",
  MISSING_IN: "bg-warning-light text-warning-foreground",
  MISSING_OUT: "bg-warning-light text-warning-foreground",
  ABSENT: "bg-danger-light text-destructive",
  OFF: "bg-muted text-text-muted",
  HOLIDAY: "bg-violet-light text-violet-foreground",
  FUTURE: "bg-card text-text-muted",
};

export const DAY_STATUS_LABEL: Record<AttendanceDayStatus, string> = {
  WORK: "Đi làm",
  LEAVE: "Nghỉ có đơn",
  MISSING_IN: "Thiếu chấm vào",
  MISSING_OUT: "Thiếu chấm ra",
  ABSENT: "Vắng",
  OFF: "Chủ nhật",
  HOLIDAY: "Ngày lễ",
  FUTURE: "",
};

// Ký hiệu ngắn trong ô bảng công.
export function dayShortCode(d: AttendanceDayCell): string {
  if (d.status === "OFF") return "CN";
  if (d.status === "HOLIDAY") return "L";
  if (d.status === "LEAVE") return d.leaveType === "ANNUAL_LEAVE" ? "P" : d.leaveType === "SICK_LEAVE" ? "Ô" : "KL";
  if (d.status === "WORK") return d.workUnits === 0.5 ? "½" : d.workUnits === 1 ? "X" : "•";
  if (d.status === "MISSING_IN" || d.status === "MISSING_OUT") return "T";
  if (d.status === "ABSENT") return "V";
  return "";
}

export const STATUS_BADGE_VARIANT: Record<AttendanceRequestStatus, "in-progress" | "info" | "completed" | "overdue" | "outline"> = {
  PENDING_MANAGER: "in-progress",
  PENDING_HR: "info",
  APPROVED: "completed",
  REJECTED: "overdue",
  CANCELLED: "outline",
};

export function RequestStatusBadge({ status }: { status: AttendanceRequestStatus }) {
  return <Badge variant={STATUS_BADGE_VARIANT[status]}>{ATTENDANCE_REQUEST_STATUS_LABELS[status]}</Badge>;
}

export function fmtDateKey(iso: string): string {
  const k = iso.slice(0, 10);
  return `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
}

export type RequestLike = {
  type: AttendanceRequestType;
  startDate: string;
  endDate: string;
  dayPortion: AttendanceDayPortion;
  leaveDays: number;
  lateMinutes: number | null;
  earlyMinutes: number | null;
  missedCheckIn: string | null;
  missedCheckOut: string | null;
};

// Mô tả ngắn nội dung 1 đơn.
export function describeRequest(r: RequestLike): string {
  const start = fmtDateKey(r.startDate);
  const end = fmtDateKey(r.endDate);
  switch (r.type) {
    case "ANNUAL_LEAVE":
    case "SICK_LEAVE":
    case "UNPAID_LEAVE":
      return start === end
        ? `${start}${r.dayPortion !== "FULL" ? ` (${DAY_PORTION_LABELS[r.dayPortion].toLowerCase()})` : ""} · ${r.leaveDays} ngày`
        : `${start} → ${end} · ${r.leaveDays} ngày`;
    case "LATE_EARLY":
      return [start, r.lateMinutes ? `muộn ${r.lateMinutes} phút` : null, r.earlyMinutes ? `về sớm ${r.earlyMinutes} phút` : null].filter(Boolean).join(" · ");
    case "MISSED_CHECK":
      return [start, r.missedCheckIn ? `vào ${r.missedCheckIn}` : null, r.missedCheckOut ? `ra ${r.missedCheckOut}` : null].filter(Boolean).join(" · ");
  }
}

export { ATTENDANCE_REQUEST_TYPE_LABELS };

type DayDetail = {
  record: {
    shiftStart: string; shiftEnd: string;
    checkIn: string | null; checkOut: string | null;
    checkInDistance: number | null; checkOutDistance: number | null;
    checkInLat: number | null; checkInLng: number | null;
    checkOutLat: number | null; checkOutLng: number | null;
    lateMinutes: number; earlyMinutes: number;
    checkInPhotoUrl: string | null; checkOutPhotoUrl: string | null;
    photosPurged: boolean;
  } | null;
  requests: (RequestLike & { id: string; status: AttendanceRequestStatus; reason: string })[];
};

// Hộp chi tiết 1 ngày: giờ vào/ra, khoảng cách GPS (link bản đồ), ảnh selfie, đơn liên quan.
export function DayDetailDialog({
  target,
  onClose,
}: {
  target: { userId: string; userName: string; date: string } | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<DayDetail | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const key = target ? `${target.userId}|${target.date}` : null;

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    fetch(`/api/attendance/timesheet/day?userId=${target.userId}&date=${target.date}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoadedKey(`${target.userId}|${target.date}`);
      });
    return () => { cancelled = true; };
  }, [target]);

  const loading = !!key && loadedKey !== key;
  const rec = data?.record;

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target ? `${target.userName} · ${fmtDateKey(target.date)}` : ""}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
        ) : (
          <div className="space-y-4 text-sm">
            {!rec ? (
              <p className="text-text-muted">Không có lượt chấm công nào trong ngày.</p>
            ) : (
              <>
                <p className="text-text-secondary">Ca: {rec.shiftStart} – {rec.shiftEnd}</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["IN", "OUT"] as const).map((kind) => {
                    const time = kind === "IN" ? rec.checkIn : rec.checkOut;
                    const dist = kind === "IN" ? rec.checkInDistance : rec.checkOutDistance;
                    const lat = kind === "IN" ? rec.checkInLat : rec.checkOutLat;
                    const lng = kind === "IN" ? rec.checkInLng : rec.checkOutLng;
                    const photo = kind === "IN" ? rec.checkInPhotoUrl : rec.checkOutPhotoUrl;
                    const minutes = kind === "IN" ? rec.lateMinutes : rec.earlyMinutes;
                    return (
                      <div key={kind} className="rounded-lg border border-border p-2 space-y-1.5">
                        <p className="font-semibold text-foreground">{kind === "IN" ? "Chấm vào" : "Chấm ra"}: {time ?? "—"}</p>
                        {minutes > 0 && (
                          <p className="text-xs text-warning-foreground">{kind === "IN" ? "Muộn" : "Về sớm"} {minutes} phút</p>
                        )}
                        {dist != null && lat != null && lng != null && (
                          <a
                            href={`https://www.google.com/maps?q=${lat},${lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-info-foreground inline-flex items-center gap-1 underline"
                          >
                            <MapPin className="w-3 h-3" /> cách khu {dist}m
                          </a>
                        )}
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo} alt="Ảnh selfie" className="w-full aspect-square object-cover rounded-md bg-muted" />
                        ) : time ? (
                          <p className="text-xs text-text-muted">{rec.photosPurged ? "Ảnh đã tự xoá sau 30 ngày" : "Không có ảnh"}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {data && data.requests.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Đơn liên quan</p>
                {data.requests.map((r) => (
                  <div key={r.id} className="rounded-lg border border-divider p-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{ATTENDANCE_REQUEST_TYPE_LABELS[r.type]}</span>
                      <RequestStatusBadge status={r.status} />
                    </div>
                    <p className="text-text-secondary">{describeRequest(r)}</p>
                    <p className="text-text-muted text-xs">Lý do: {r.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
