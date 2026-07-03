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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  categoryId: z.string().optional(),
  name: z.string().min(2),
  description: z.string().optional(),
  transferWaitWeeks: z.coerce.number().int().min(1),
  rootingWeeks: z.coerce.number().int().min(1),
});

type FormData = z.infer<typeof schema>;
type Category = { id: string; code: string; name: string };
type PlantType = FormData & { id: string; code: string; isActive: boolean };

export default function PlantTypeDialog({
  categories, plant,
}: {
  categories: Category[];
  plant?: PlantType;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const router = useRouter();
  const isEdit = !!plant;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: plant ?? { transferWaitWeeks: 5, rootingWeeks: 5 },
  });

  const onSubmit = async (data: FormData) => {
    if (!isEdit && !categoryId) { toast.error("Chọn loại cây"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/plant-types", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: plant!.id, ...data } : { categoryId, ...data }),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success(isEdit ? "Cập nhật thành công" : "Thêm chi tiết loại cây thành công");
      setOpen(false);
      reset();
      setCategoryId("");
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={isEdit ? <Button variant="ghost" size="sm" /> : <Button className="bg-green-600 hover:bg-green-700" />}>
        {isEdit
          ? <Pencil className="w-4 h-4" />
          : <><Plus className="w-4 h-4 mr-2" />Thêm chi tiết loại cây</>
        }
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Sửa chi tiết loại cây ${plant.code}` : "Thêm chi tiết loại cây mới"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="space-y-4 mt-2">
          {isEdit ? (
            <div className="space-y-1">
              <Label>Mã chi tiết</Label>
              <Input value={plant.code} disabled />
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Loại cây</Label>
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string | null) => {
                    const c = categories.find((x) => x.id === v);
                    return c ? `${c.code} — ${c.name}` : "Chọn loại cây";
                  }}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Tên chi tiết loại cây</Label>
            <Input {...register("name")} placeholder="VD: Trầu bà lá xẻ" />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Mô tả (tùy chọn)</Label>
            <Input {...register("description")} placeholder="Ghi chú thêm..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Thời gian đợi cấy chuyển (tuần)</Label>
              <Input {...register("transferWaitWeeks")} type="number" min={1} />
              {errors.transferWaitWeeks && <p className="text-xs text-red-500">{errors.transferWaitWeeks.message}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium">Thời gian ra rễ (tuần)</Label>
              <Input {...register("rootingWeeks")} type="number" min={1} />
              {errors.rootingWeeks && <p className="text-xs text-red-500">{errors.rootingWeeks.message}</p>}
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
