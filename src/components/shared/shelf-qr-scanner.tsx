"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ScanLine } from "lucide-react";

const SCAN_ELEMENT_ID = "shelf-qr-scanner-viewport";
// Quét lại đúng 1 mã trong khoảng thời gian này sẽ bị bỏ qua — camera vẫn giữ mã kệ trong khung hình
// nên html5-qrcode bắn callback liên tục, không debounce sẽ tưởng NV quét nhiều lần liên tiếp.
const RESCAN_COOLDOWN_MS = 2000;

interface ShelfQrScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanCode: (code: string) => void;
}

export default function ShelfQrScanner({ open, onOpenChange, onScanCode }: ShelfQrScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const onScanCodeRef = useRef(onScanCode);
  onScanCodeRef.current = onScanCode;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStarting(true);
    setError(null);

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (cancelled) return;
      const scanner = new Html5Qrcode(SCAN_ELEMENT_ID);
      scannerRef.current = scanner;
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          (decodedText) => {
            const last = lastScanRef.current;
            const now = Date.now();
            if (last && last.code === decodedText && now - last.at < RESCAN_COOLDOWN_MS) return;
            lastScanRef.current = { code: decodedText, at: now };
            onScanCodeRef.current(decodedText);
          },
          () => { /* không tìm thấy QR trong khung hình — bỏ qua, đây là callback liên tục bình thường */ }
        )
        .then(() => { if (!cancelled) setStarting(false); })
        .catch((err) => {
          if (cancelled) return;
          setStarting(false);
          setError(err instanceof Error ? err.message : "Không mở được camera — kiểm tra quyền truy cập camera của trình duyệt");
        });
    });

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      }
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5" /> Quét QR giàn kệ</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {error ? (
            <p className="text-sm text-red-600 py-8 text-center">{error}</p>
          ) : (
            <div className="relative">
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              )}
              <div id={SCAN_ELEMENT_ID} className="rounded-lg overflow-hidden" />
            </div>
          )}
          <p className="text-xs text-gray-400 text-center">Đưa QR code của giàn kệ vào khung hình — có thể quét liên tiếp nhiều kệ</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
