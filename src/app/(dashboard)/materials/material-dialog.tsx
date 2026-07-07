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
  name: z.string().min(2),
  unit: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type Material = FormData & { id: string; isActive: boolean };

export default function MaterialDialog({ item }: { item?: Material }) {
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
      const res = await fetch(isEdit ? `/api/materials/${item!.id}` : "/api/materials", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { name: data.name, unit: data.unit } : data),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success(isEdit ? "Cập nhật thành công" : "Thêm vật tư thành công");
      setOpen(false); reset(); router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={isEdit ? <Button variant="ghost" size="sm" /> : <Button className="bg-primary hover:bg-primary-hover" />}>
        {isEdit
          ? <><Pencil className="w-4 h-4 mr-2" />Chỉnh sửa</>
          : <><Plus className="w-4 h-4 mr-2" />Thêm vật tư</>
        }
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Sửa vật tư" : "Thêm vật tư mới"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Mã vật tư</Label>
              <Input {...register("code")} placeholder="VT001" disabled={isEdit} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Tên vật tư</Label>
              <Input {...register("name")} placeholder="Bình tam giác 250ml" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Đơn vị tính</Label>
            <Input {...register("unit")} placeholder="cái, kg, lít..." />
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
