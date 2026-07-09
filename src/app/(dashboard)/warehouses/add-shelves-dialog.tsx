"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, Layers } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  rowFrom: z.number().int().min(1),
  rowTo: z.number().int().min(1),
  colFrom: z.number().int().min(1),
  colTo: z.number().int().min(1),
  capacity: z.number().int().positive().optional(),
});

type FormData = z.infer<typeof schema>;

export default function AddShelvesDialog({
  roomId, roomCode, roomType,
}: {
  roomId: string;
  roomCode: string;
  roomType: "PHONG_MAU_ME" | "PHONG_RA_RE";
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isMauMe = roomType === "PHONG_MAU_ME";

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { rowFrom: 1, rowTo: 1, colFrom: 1, colTo: 5, capacity: isMauMe ? 1800 : undefined },
  });

  const [rowFrom, rowTo, colFrom, colTo] = watch(["rowFrom", "rowTo", "colFrom", "colTo"]);
  const previewCount =
    [rowFrom, rowTo, colFrom, colTo].every((v) => Number.isFinite(v)) && rowTo >= rowFrom && colTo >= colFrom
      ? (rowTo - rowFrom + 1) * (colTo - colFrom + 1)
      : 0;

  const onSubmit = async (data: FormData) => {
    if (data.rowFrom > data.rowTo || data.colFrom > data.colTo) {
      toast.error("Khoảng hàng/cột không hợp lệ");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/shelves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, ...data }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(
        json.skippedCodes.length > 0
          ? `Đã tạo ${json.createdCount} kệ mới — bỏ qua ${json.skippedCodes.length} kệ đã có mã trùng`
          : `Đã tạo ${json.createdCount} kệ mới`
      );
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Thêm giàn kệ
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="w-5 h-5" /> Thêm giàn kệ — {roomCode}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <p className="text-xs text-text-secondary">
            Tạo nhiều kệ cùng lúc theo lưới hàng/cột — mã kệ tự sinh dạng {roomCode}-R{"{hàng}"}C{"{cột}"}.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Hàng từ</Label>
              <Input type="number" min={1} {...register("rowFrom", { valueAsNumber: true })} />
              {errors.rowFrom && <p className="text-xs text-destructive">{errors.rowFrom.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Hàng đến</Label>
              <Input type="number" min={1} {...register("rowTo", { valueAsNumber: true })} />
              {errors.rowTo && <p className="text-xs text-destructive">{errors.rowTo.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Cột từ</Label>
              <Input type="number" min={1} {...register("colFrom", { valueAsNumber: true })} />
              {errors.colFrom && <p className="text-xs text-destructive">{errors.colFrom.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Cột đến</Label>
              <Input type="number" min={1} {...register("colTo", { valueAsNumber: true })} />
              {errors.colTo && <p className="text-xs text-destructive">{errors.colTo.message}</p>}
            </div>
          </div>
          {isMauMe && (
            <div className="space-y-1">
              <Label>Sức chứa mỗi kệ (cụm)</Label>
              <Input type="number" min={1} {...register("capacity", { valueAsNumber: true })} placeholder="1800" />
            </div>
          )}
          <p className="text-sm text-primary-strong bg-primary-light rounded-md px-3 py-2">
            Sẽ tạo tối đa <strong>{previewCount}</strong> kệ (tự bỏ qua kệ đã có mã trùng).
          </p>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="submit" className="flex-1 bg-primary hover:bg-primary-hover" disabled={loading || previewCount === 0}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Tạo kệ
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
