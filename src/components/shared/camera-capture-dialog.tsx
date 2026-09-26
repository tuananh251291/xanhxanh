"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Check, Loader2, AlertTriangle, SwitchCamera } from "lucide-react";

// Không dùng <input type="file"> nữa — dù có capture="environment" thì đó vẫn chỉ là GỢI Ý cho trình
// duyệt, trên máy tính/laptop vẫn rơi về hộp thoại chọn file thường (cho phép chọn bất kỳ ảnh có sẵn).
// Mở thẳng luồng camera trực tiếp bằng getUserMedia (không qua bất kỳ hộp thoại hệ điều hành nào để
// "trốn" ra ngoài chọn file) là cách DUY NHẤT đảm bảo ảnh chắc chắn là khung hình sống từ camera.
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|BlackBerry/i.test(navigator.userAgent);
}

type Phase = "blocked" | "requesting" | "preview" | "captured" | "error";

// Dialog chụp ảnh trực tiếp — trả về đúng 1 File qua onCaptured, giống hệt hợp đồng cũ của
// <input type="file">.onChange, nên nơi gọi (MultiPhotoSlotGroup) không cần biết gì về luồng camera bên
// trong. Chặn HẲN thiết bị không phải điện thoại (isMobileDevice) TRƯỚC KHI xin quyền camera — theo đúng
// yêu cầu nghiệp vụ "chỉ chấp nhận ảnh chụp từ điện thoại", không quan tâm laptop có webcam hay không.
export default function CameraCaptureDialog({
  open, onOpenChange, onCaptured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured: (file: File) => void;
}) {
  const [phase, setPhase] = useState<Phase>("requesting");
  const [errorMessage, setErrorMessage] = useState("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedFileRef = useRef<File | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async (mode: "environment" | "user") => {
    stopStream();
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setPhase("preview");
    } catch {
      setErrorMessage("Không mở được camera — kiểm tra đã cho phép quyền truy cập camera cho trình duyệt chưa.");
      setPhase("error");
    }
  }, [stopStream]);

  // Reset lại toàn bộ trạng thái mỗi lần MỞ dialog (không phải mỗi lần open thay đổi giá trị bất kỳ) —
  // đảm bảo lần mở sau luôn bắt đầu lại từ đầu, không giữ ảnh/lỗi của lần trước.
  useEffect(() => {
    if (!open) return;
    setCapturedPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    capturedFileRef.current = null;
    setFacingMode("environment");

    if (!isMobileDevice()) {
      setPhase("blocked");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Trình duyệt này không hỗ trợ chụp ảnh trực tiếp — vui lòng cập nhật trình duyệt.");
      setPhase("error");
      return;
    }
    startCamera("environment");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy lại khi open đổi, không phải khi startCamera đổi (tránh vòng lặp re-request camera)
  }, [open]);

  // Luôn tắt camera khi đóng dialog/unmount — tránh giữ đèn camera sáng sau khi dùng xong.
  useEffect(() => {
    if (!open) stopStream();
    return () => stopStream();
  }, [open, stopStream]);

  const switchCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      capturedFileRef.current = file;
      setCapturedPreviewUrl(URL.createObjectURL(blob));
      setPhase("captured");
      stopStream();
    }, "image/jpeg", 0.92);
  };

  const retake = () => {
    setCapturedPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    capturedFileRef.current = null;
    startCamera(facingMode);
  };

  const confirm = () => {
    if (!capturedFileRef.current) return;
    onCaptured(capturedFileRef.current);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="w-5 h-5" /> Chụp ảnh bằng chứng</DialogTitle>
          {phase === "preview" && <DialogDescription>Đưa sản phẩm vào khung hình rồi bấm Chụp.</DialogDescription>}
        </DialogHeader>

        {phase === "blocked" && (
          <div className="space-y-3 py-4 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto text-warning" />
            <p className="text-sm text-foreground">
              Bạn cần ảnh chụp trực tiếp từ điện thoại — vui lòng mở trang này trên điện thoại để tiếp tục.
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3 py-4 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
            <p className="text-sm text-foreground">{errorMessage}</p>
          </div>
        )}

        {phase === "requesting" && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        )}

        {(phase === "preview" || phase === "requesting") && (
          <div className={`relative rounded-lg overflow-hidden bg-black aspect-[3/4] ${phase === "requesting" ? "hidden" : ""}`}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
        )}

        {phase === "captured" && capturedPreviewUrl && (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[3/4]">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh vừa chụp, chưa tải lên server */}
            <img src={capturedPreviewUrl} alt="Ảnh vừa chụp" className="w-full h-full object-cover" />
          </div>
        )}

        <DialogFooter>
          {phase === "blocked" || phase === "error" ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
          ) : phase === "captured" ? (
            <>
              <Button variant="outline" onClick={retake}><RotateCcw className="w-4 h-4 mr-1.5" /> Chụp lại</Button>
              <Button className="bg-primary hover:bg-primary-hover" onClick={confirm}><Check className="w-4 h-4 mr-1.5" /> Dùng ảnh này</Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={phase !== "preview"} onClick={switchCamera}>
                <SwitchCamera className="w-4 h-4 mr-1.5" /> Đổi camera
              </Button>
              <Button className="bg-primary hover:bg-primary-hover" disabled={phase !== "preview"} onClick={capture}>
                <Camera className="w-4 h-4 mr-1.5" /> Chụp
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
