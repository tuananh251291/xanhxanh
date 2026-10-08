"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, MapPin, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { ATTENDANCE_SELFIE_COMPRESS_OPTIONS, distanceMeters } from "@/lib/attendance";

type Site = { latitude: number; longitude: number; radiusMeters: number; name: string };
type Fix = { latitude: number; longitude: number; accuracy: number; distance: number };
type Step = "locating" | "camera" | "submitting" | "done" | "error";

// Gửi lý do lỗi phía điện thoại về server (ghi vào log PM2) — lỗi GPS/camera không bao giờ tới API chấm
// công nên không có cách nào khác để biết NV bị kẹt ở bước nào.
// Mỗi loại lỗi chỉ gửi 1 lần/lượt mở trang — watchPosition có thể gọi lại hàm lỗi liên tục (1 máy từng gửi >130 dòng).
const reportedStages = new Set<string>();
function reportClientError(stage: string, message: string) {
  if (reportedStages.has(stage)) return;
  reportedStages.add(stage);
  fetch("/api/attendance/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage, message: message.slice(0, 300) }),
    keepalive: true,
  }).catch(() => null);
}

function geoErrorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) {
      const app = /GSA\//.test(ua) ? "Google" : /CriOS/.test(ua) ? "Chrome" : /Zalo/i.test(ua) ? "Zalo" : "Safari";
      return app === "Safari"
        ? "iPhone đang chặn Vị trí cho Safari. Vào Cài đặt → Quyền riêng tư & Bảo mật → Dịch vụ định vị: BẬT, kéo xuống \"Trang web Safari\" → chọn \"Khi dùng ứng dụng\". Sau đó mở lại Safari, bấm \"aA\" trên thanh địa chỉ → Cài đặt trang web → Vị trí → Cho phép, rồi Thử lại."
        : `iPhone đang chặn Vị trí cho ứng dụng ${app}. Vào Cài đặt → Quyền riêng tư & Bảo mật → Dịch vụ định vị → ${app} → chọn "Khi dùng ứng dụng" và bật "Vị trí chính xác". Hoặc mở trang này bằng Safari.`;
    }
    return "Trình duyệt đang chặn Vị trí. Bấm biểu tượng bên trái thanh địa chỉ → Quyền → Vị trí → Cho phép (hoặc \"Đặt lại quyền\"), bật Vị trí (GPS) trên điện thoại, rồi Thử lại.";
  }
  if (err.code === err.TIMEOUT) return "Lấy vị trí GPS quá lâu — ra chỗ thoáng hơn rồi bấm Thử lại.";
  return "Không lấy được vị trí GPS — kiểm tra đã bật Định vị trên điện thoại chưa.";
}

// Luồng chấm công 2 bước, mọi thứ diễn ra NGAY TRONG TRANG (không chuyển sang app camera — iPhone tạm dừng
// trang khi mở app camera làm GPS bị kẹt, Android máy yếu còn tải lại trang làm mất ảnh):
// 1) Định vị: theo dõi GPS liên tục, hiện khoảng cách tới khu, chỉ cho đi tiếp khi đã trong bán kính.
// 2) Selfie bằng camera trước trong trang (getUserMedia); không mở được thì dùng camera điện thoại.
export default function CheckInFlowDialog({
  action,
  site,
  onClose,
  onSuccess,
}: {
  action: "IN" | "OUT" | null;
  site: Site | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [step, setStep] = useState<Step>("locating");
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [watchKey, setWatchKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fixRef = useRef<Fix | null>(null);

  const open = action !== null;
  const actionLabel = action === "IN" ? "Chấm vào" : "Chấm ra";

  // Mở lại hộp thoại → bắt đầu lại từ bước định vị.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStep("locating"); setFix(null); setGeoError(null); setCameraError(null); setCameraReady(false); setResultMessage("");
    }
  }

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Bước 1: theo dõi GPS liên tục (mỗi lần có toạ độ mới thì giữ bản chính xác nhất).
  useEffect(() => {
    if (!open || step !== "locating" || !site) return;
    if (!navigator.geolocation) {
      const msg = "Thiết bị/trình duyệt không hỗ trợ định vị GPS";
      queueMicrotask(() => setGeoError(msg));
      reportClientError("geo-unsupported", navigator.userAgent);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next: Fix = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          distance: distanceMeters(pos.coords.latitude, pos.coords.longitude, site.latitude, site.longitude),
        };
        const prev = fixRef.current;
        // Luôn lấy toạ độ mới nhất — trừ khi đã có 1 lần vào bán kính mà lần mới (GPS nhảy) lại ra ngoài.
        const keepPrev = !!prev && prev.distance <= site.radiusMeters && next.distance > site.radiusMeters;
        if (!keepPrev) { fixRef.current = next; setFix(next); }
        setGeoError(null);
      },
      (err) => {
        setGeoError(geoErrorMessage(err));
        reportClientError(`geo-${err.code}`, `${err.message} | ${navigator.userAgent}`);
        // Bị từ chối quyền thì dừng dò (dò tiếp chỉ lặp lại cùng lỗi) — NV bấm "Thử lại" sau khi sửa cài đặt.
        if (err.code === err.PERMISSION_DENIED) navigator.geolocation.clearWatch(watchId);
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [open, step, site, watchKey]);

  // Bước 2: bật camera trước trong trang.
  useEffect(() => {
    if (!open || step !== "camera") return;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Trình duyệt này không mở được camera trong trang — dùng nút bên dưới để chụp bằng camera điện thoại.");
        reportClientError("camera-unsupported", navigator.userAgent);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => null);
        }
        setCameraReady(true);
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setCameraError(
          name === "NotAllowedError"
            ? "Bạn chưa cho phép dùng Camera — cho phép trong cài đặt trình duyệt, hoặc dùng nút bên dưới."
            : "Không mở được camera trong trang — dùng nút bên dưới để chụp bằng camera điện thoại."
        );
        reportClientError(`camera-${name || "error"}`, `${e instanceof Error ? e.message : String(e)} | ${navigator.userAgent}`);
      }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [open, step, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const submit = async (file: File) => {
    const currentFix = fixRef.current;
    if (!action || !currentFix) return;
    stopCamera();
    setStep("submitting");
    try {
      const image = await compressImageToDataUrl(file, ATTENDANCE_SELFIE_COMPRESS_OPTIONS);
      const res = await fetch("/api/attendance/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, latitude: currentFix.latitude, longitude: currentFix.longitude, accuracy: currentFix.accuracy, image }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResultMessage(json.message ?? `Chấm công thất bại (mã ${res.status})`);
        setStep("error");
        if (res.status >= 500) reportClientError(`submit-${res.status}`, json.message ?? "");
        return;
      }
      const msg = action === "IN"
        ? `Đã chấm vào lúc ${json.time}${json.lateMinutes > 0 ? ` — muộn ${json.lateMinutes} phút` : ""}`
        : `Đã chấm ra lúc ${json.time}${json.earlyMinutes > 0 ? ` — sớm ${json.earlyMinutes} phút` : ""}`;
      setResultMessage(msg);
      setStep("done");
      onSuccess(msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResultMessage(navigator.onLine ? `Gửi thất bại: ${msg}` : "Mất kết nối mạng — kiểm tra 4G/Wifi rồi thử lại.");
      setStep("error");
      reportClientError("submit-exception", `${msg} | ${navigator.userAgent}`);
    }
  };

  const captureFromVideo = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Camera trước hiển thị kiểu gương — lật lại cho ảnh lưu đúng chiều thật.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    canvas.width = 0; canvas.height = 0;
    if (!blob) { setCameraError("Không chụp được ảnh — dùng nút bên dưới."); return; }
    submit(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) submit(file);
  };

  const inRadius = !!fix && !!site && fix.distance <= site.radiusMeters;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && step !== "submitting") { stopCamera(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{actionLabel}{site ? ` · ${site.name}` : ""}</DialogTitle>
        </DialogHeader>

        <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFilePicked} />

        {step === "locating" && site && (
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3 rounded-lg border border-border p-3">
              <MapPin className="w-5 h-5 text-primary-strong shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Bước 1/2 — Xác định vị trí</p>
                {geoError ? (
                  <p className="text-destructive">{geoError}</p>
                ) : !fix ? (
                  <p className="text-text-secondary flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Đang lấy vị trí GPS…</p>
                ) : (
                  <>
                    <p className={inRadius ? "text-primary-strong font-medium" : "text-warning-foreground font-medium"}>
                      Cách khu {fix.distance}m (cho phép {site.radiusMeters}m) {inRadius ? "✓" : ""}
                    </p>
                    <p className="text-xs text-text-muted">Sai số GPS ±{Math.round(fix.accuracy)}m{!inRadius ? " — đứng yên vài giây hoặc ra chỗ thoáng, vị trí sẽ tự cập nhật" : ""}</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              {(geoError || (fix && !inRadius)) && (
                <Button variant="outline" onClick={() => { fixRef.current = null; setFix(null); setGeoError(null); setWatchKey((k) => k + 1); }}>
                  <RefreshCw className="w-4 h-4" /> Thử lại
                </Button>
              )}
              <Button disabled={!inRadius} onClick={() => setStep("camera")}>
                <Camera className="w-4 h-4" /> Tiếp tục chụp ảnh
              </Button>
            </div>
          </div>
        )}

        {step === "camera" && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-foreground">Bước 2/2 — Chụp ảnh selfie</p>
            {!cameraError ? (
              <div className="relative rounded-lg overflow-hidden bg-muted aspect-square">
                <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover -scale-x-100" />
                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center text-text-secondary">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Đang mở camera…
                  </div>
                )}
              </div>
            ) : (
              <p className="text-destructive">{cameraError}</p>
            )}
            <div className="flex gap-2 justify-end flex-wrap">
              <Button variant="outline" onClick={() => { if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); } }}>
                Dùng camera điện thoại
              </Button>
              {!cameraError && (
                <Button disabled={!cameraReady} onClick={captureFromVideo}>
                  <Camera className="w-4 h-4" /> Chụp & {actionLabel.toLowerCase()}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "submitting" && (
          <div className="flex flex-col items-center gap-2 py-6 text-text-secondary">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p>Đang gửi chấm công…</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-primary-strong" />
            <p className="text-base font-semibold text-foreground">{resultMessage}</p>
            <Button onClick={onClose}>Đóng</Button>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <XCircle className="w-12 h-12 text-destructive" />
            <p className="text-sm text-destructive">{resultMessage}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Đóng</Button>
              <Button onClick={() => { fixRef.current = null; setFix(null); setStep("locating"); setWatchKey((k) => k + 1); }}>Thử lại</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
