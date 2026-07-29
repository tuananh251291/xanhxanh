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
import { Plus, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  code: z.string().min(2),
  name: z.string().min(1),
  botanicalName: z.string().optional(),
  unit: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type Product = FormData & { id: string };

export default function ProductDialog({ item }: { item?: Product }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isEdit = !!item;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: item,
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const res = await fetch(isEdit ? `/api/products/${item!.id}` : "/api/products", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { name: data.name, botanicalName: data.botanicalName, unit: data.unit } : data),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success(isEdit ? "Cập nhật thành công" : "Thêm sản phẩm thành công");
      setOpen(false); reset(); router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={isEdit ? <Button variant="ghost" size="sm" title="Sửa sản phẩm" /> : <Button className="bg-primary hover:bg-primary-hover" />}>
        {isEdit
          ? <Pencil className="w-4 h-4" />
          : <><Plus className="w-4 h-4 mr-2" />Thêm sản phẩm</>
        }
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Sửa sản phẩm" : "Thêm sản phẩm mới"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} method="post" className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label>Mã sản phẩm (Item code trên invoice)</Label>
            <Input {...register("code")} placeholder="VD: PD19T10" disabled={isEdit} className="font-mono" />
            {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Tên sản phẩm (Model name)</Label>
            <Input {...register("name")} placeholder="VD: Philodendron Snowdrift Variegated" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Tên khoa học (không bắt buộc)</Label>
            <Input {...register("botanicalName")} placeholder="VD: Philodendron sp" />
          </div>
          <div className="space-y-1">
            <Label>Đơn vị (không bắt buộc)</Label>
            <Input {...register("unit")} placeholder="VD: Plant/UNY" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="submit" className="flex-1 bg-primary hover:bg-primary-hover" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Cập nhật" : "Thêm"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
