"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Camera, X, Send, Check, Info } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { REJECT_CLASSIFICATION_COMPRESS_OPTIONS } from "@/lib/reject-classification-constants";

type Item = {
  id: string;
  plantType: { code: string; name: string };
  stageCode: string;
  rejectedQuantity: number;
  destroyQuantity: number;
  plantQuantity: number;
  destroyPhotoUrls: string[];
  plantPhotoUrls: string[];
  saleNote: string | null;
};
type Classification = {
  id: string;
  code: string;
  status: "PENDING_CLASSIFICATION" | "PENDING_APPROVAL" | "APPROVED";
  transfer: { code: string; transferredAt: string };
  warehouse: { code: string; name: string };
  createdBy: { code: string; name: string };
  approvedBy: { code: string; name: string } | null;
  items: Item[];
};

const STATUS_LABEL: Record<Classification["status"], string> = {
  PENDING_CLASSIFICATION: "Chưa phân loại",
  PENDING_APPROVAL: "Chờ duyệt",
  APPROVED: "Đã duyệt",
};
const STATUS_BADGE_VARIANT: Record<Classification["status"], "info" | "in-progress" | "completed"> = {
  PENDING_CLASSIFICATION: "info",
  PENDING_APPROVAL: "in-progress",
  APPROVED: "completed",
};

function PhotoSlotGroup({
  urls, editable, uploading, onAdd, onRemove,
}: {
  urls: string[];
  editable: boolean;
  uploading: boolean;
  onAdd: (file: File) => void;
  onRemove: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url) => (
        <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- ảnh từ Supabase Storage, không phải asset tĩnh */}
          <img src={url} alt="Ảnh bằng chứng" className="w-full h-full object-cover cursor-pointer" onClick={() => window.open(url, "_blank")} />
          {editable && (
            <button
              type="button"
              onClick={() => onRemove(url)}
              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
              aria-label="Xoá ảnh"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onAdd(f); }}
          />
          <Button
            type="button"
            variant="outline"
            className="w-16 h-16 shrink-0"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </Button>
        </>
      )}
    </div>
  );
}

export default function RejectClassificationDetailBoard({ id, canSubmit, canApprove }: { id: string; canSubmit: boolean; canApprove: boolean }) {
  const [data, setData] = useState<Classification | null>(null);
  const [loading, setLoading] = useState(true);
  const [destroyQty, setDestroyQty] = useState<Record<string, number>>({});
  const [saleNote, setSaleNote] = useState<Record<string, string>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reject-classifications/${id}`);
      if (!res.ok) { toast.error("Không tải được đề xuất"); return; }
      const json: Classification = await res.json();
      setData(json);
      setDestroyQty(Object.fromEntries(json.items.map((it) => [it.id, it.destroyQuantity])));
      setSaleNote(Object.fromEntries(json.items.map((it) => [it.id, it.saleNote ?? ""])));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  const isSubmitMode = canSubmit && data.status === "PENDING_CLASSIFICATION";
  const isApproveMode = canApprove && data.status === "PENDING_APPROVAL";
  const isEditable = isSubmitMode || isApproveMode;

  const plantQtyFor = (item: Item) => Math.max(0, item.rejectedQuantity - (destroyQty[item.id] ?? item.destroyQuantity));

  const setQty = (item: Item, value: number) => {
    const clamped = Math.max(0, Math.min(value, item.rejectedQuantity));
    setDestroyQty((prev) => ({ ...prev, [item.id]: clamped }));
  };

  const handleAddPhoto = async (item: Item, kind: "destroy" | "plant", file: File) => {
    const key = `${item.id}:${kind}`;
    setUploadingKey(key);
    try {
      const compressed = await compressImageToDataUrl(file, REJECT_CLASSIFICATION_COMPRESS_OPTIONS);
      const res = await fetch(`/api/reject-classifications/${id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, kind, dataUrl: compressed }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Tải ảnh lên thất bại"); return; }
      setData((prev) => prev && ({
        ...prev,
        items: prev.items.map((it) => it.id === item.id ? { ...it, destroyPhotoUrls: json.destroyPhotoUrls, plantPhotoUrls: json.plantPhotoUrls } : it),
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không nén được ảnh — thử lại");
    } finally {
      setUploadingKey(null);
    }
  };

  const handleRemovePhoto = async (item: Item, kind: "destroy" | "plant", url: string) => {
    const res = await fetch(`/api/reject-classifications/${id}/photos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, kind, url }),
    });
    if (!res.ok) { toast.error("Không gỡ được ảnh"); return; }
    setData((prev) => prev && ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.id !== item.id) return it;
        const field = kind === "destroy" ? "destroyPhotoUrls" : "plantPhotoUrls";
        return { ...it, [field]: it[field].filter((u) => u !== url) };
      }),
    }));
  };

  const submit = async () => {
    if (!data) return;
    for (const item of data.items) {
      const plantQty = plantQtyFor(item);
      const dQty = destroyQty[item.id] ?? item.destroyQuantity;
      if (dQty > 0 && item.destroyPhotoUrls.length === 0) {
        toast.error(`Cần đính kèm ảnh cho phần đề xuất huỷ (${item.plantType.name} ${item.stageCode})`);
        return;
      }
      if (plantQty > 0 && item.plantPhotoUrls.length === 0) {
        toast.error(`Cần đính kèm ảnh cho phần đề xuất trồng (${item.plantType.name} ${item.stageCode})`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reject-classifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          items: data.items.map((it) => ({
            itemId: it.id,
            destroyQuantity: destroyQty[it.id] ?? it.destroyQuantity,
            destroyPhotoUrls: it.destroyPhotoUrls,
            plantPhotoUrls: it.plantPhotoUrls,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã gửi đề xuất");
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async () => {
    if (!data) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reject-classifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          items: data.items.map((it) => ({
            itemId: it.id,
            destroyQuantity: destroyQty[it.id] ?? it.destroyQuantity,
            saleNote: saleNote[it.id]?.trim() || undefined,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã duyệt đề xuất");
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Phân loại hàng không đạt — {data.code}</h1>
          <p className="text-text-secondary text-sm mt-1">
            Lô hàng nhập ngày {format(new Date(data.transfer.transferredAt), "dd/MM/yyyy", { locale: vi })} (phiếu {data.transfer.code}) —{" "}
            {data.warehouse.name}
          </p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[data.status]}>{STATUS_LABEL[data.status]}</Badge>
      </div>

      {isSubmitMode && (
        <p className="text-sm text-info-foreground bg-info-light rounded-lg p-3 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          Bạn cần đính kèm ảnh sản phẩm không đạt để quản lý kĩ thuật xác nhận lại.
        </p>
      )}

      <Card>
        <CardHeader><CardTitle>Chi tiết phân loại</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Loại cây</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Không đạt</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Đề xuất huỷ</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Ảnh huỷ</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Đề xuất trồng</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Ảnh trồng</th>
                  {(isApproveMode || data.status === "APPROVED") && (
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Ghi chú</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const plantQty = plantQtyFor(item);
                  return (
                    <tr key={item.id} className="border-b last:border-0 even:bg-primary-light/30 align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.plantType.name}</div>
                        <div className="text-xs text-text-muted font-mono">{item.plantType.code}</div>
                      </td>
                      <td className="px-3 py-2 font-medium">{item.stageCode}</td>
                      <td className="px-3 py-2">{item.rejectedQuantity.toLocaleString("vi-VN")}</td>
                      <td className="px-3 py-2">
                        {isEditable ? (
                          <Input
                            type="number"
                            min={0}
                            max={item.rejectedQuantity}
                            className="w-24 h-8"
                            value={destroyQty[item.id] ?? ""}
                            onChange={(e) => setQty(item, parseInt(e.target.value, 10) || 0)}
                          />
                        ) : (
                          item.destroyQuantity.toLocaleString("vi-VN")
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <PhotoSlotGroup
                          urls={item.destroyPhotoUrls}
                          editable={isSubmitMode}
                          uploading={uploadingKey === `${item.id}:destroy`}
                          onAdd={(f) => handleAddPhoto(item, "destroy", f)}
                          onRemove={(u) => handleRemovePhoto(item, "destroy", u)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-primary-strong">{plantQty.toLocaleString("vi-VN")}</td>
                      <td className="px-3 py-2">
                        <PhotoSlotGroup
                          urls={item.plantPhotoUrls}
                          editable={isSubmitMode}
                          uploading={uploadingKey === `${item.id}:plant`}
                          onAdd={(f) => handleAddPhoto(item, "plant", f)}
                          onRemove={(u) => handleRemovePhoto(item, "plant", u)}
                        />
                      </td>
                      {(isApproveMode || data.status === "APPROVED") && (
                        <td className="px-3 py-2">
                          {isApproveMode ? (
                            <textarea
                              rows={2}
                              className="w-40 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                              value={saleNote[item.id] ?? ""}
                              onChange={(e) => setSaleNote((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            />
                          ) : (
                            <span className="text-text-secondary">{item.saleNote || "—"}</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {isSubmitMode && (
        <div className="flex justify-end">
          <Button className="bg-primary hover:bg-primary-hover" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
            Gửi đề xuất
          </Button>
        </div>
      )}
      {isApproveMode && (
        <div className="flex justify-end">
          <Button className="bg-primary hover:bg-primary-hover" onClick={approve} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
            Duyệt
          </Button>
        </div>
      )}
      {data.status === "APPROVED" && data.approvedBy && (
        <p className="text-sm text-text-muted">Đã duyệt bởi {data.approvedBy.name} ({data.approvedBy.code})</p>
      )}
    </div>
  );
}
