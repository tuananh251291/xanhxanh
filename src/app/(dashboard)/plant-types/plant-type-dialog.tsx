"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
  lightRoomWeeksMin: z.coerce.number().int().min(1),
  lightRoomWeeksMax: z.coerce.number().int().min(1),
  finishedDaysMin: z.coerce.number().int().min(1),
  finishedDaysMax: z.coerce.number().int().min(1),
});

type FormData = z.infer<typeof schema>;
type PlantType = FormData & { id: string; isActive: boolean };

export default function PlantTypeDialog({ plant }: { plant?: PlantType }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isEdit = !!plant;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: plant ?? { lightRoomWeeksMin: 4, lightRoomWeeksMax: 6, finishedDaysMin: 30, finishedDaysMax: 45 },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const res = await fetch("/api/plant-types", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: plant!.id, ...data } : data),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success(isEdit ? "Cập nhật thành công" : "Thêm loại cây thành công");
      setOpen(false);
      reset();
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={isEdit ? <Button variant="ghost" size="sm" /> : <Button className="bg-green-600 hover:bg-green-700" />}>
        {isEdit
          ? <Pencil className="w-4 h-4" />
          : <><Plus className="w-4 h-4 mr-2" />Thêm loại cây</>
        }
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa loại cây" : "Thêm loại cây mới"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Mã cây</Label>
              <Input {...register("code")} placeholder="CAY001" disabled={isEdit} />
              {errors.code && <p className="text-xs text-red-500">{errors.code.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Tên cây</Label>
              <Input {...register("name")} placeholder="Chuối" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Mô tả (tùy chọn)</Label>
            <Input {...register("description")} placeholder="Ghi chú thêm..." />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Thời gian lưu kho sáng (tuần)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Tối thiểu</Label>
                <Input {...register("lightRoomWeeksMin")} type="number" min={1} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Tối đa</Label>
                <Input {...register("lightRoomWeeksMax")} type="number" min={1} />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Thời gian lưu kho thành phẩm (ngày)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Tối thiểu</Label>
                <Input {...register("finishedDaysMin")} type="number" min={1} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Tối đa</Label>
                <Input {...register("finishedDaysMax")} type="number" min={1} />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Cập nhật" : "Thêm"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
