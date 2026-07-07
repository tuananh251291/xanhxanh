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
  code: z.string().min(2).max(3).optional(),
  name: z.string().min(2),
});
type FormData = z.infer<typeof schema>;

type Category = { id: string; code: string; name: string; isActive: boolean };

export default function PlantCategoryDialog({ category }: { category?: Category }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isEdit = !!category;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: category,
  });

  const onSubmit = async (data: FormData) => {
    if (!isEdit && !data.code) { return; }
    setLoading(true);
    try {
      const res = await fetch("/api/plant-categories", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: category!.id, name: data.name } : data),
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
      <DialogTrigger render={isEdit ? <Button variant="ghost" size="sm" /> : <Button className="bg-primary hover:bg-primary-hover" />}>
        {isEdit
          ? <Pencil className="w-4 h-4" />
          : <><Plus className="w-4 h-4 mr-2" />Thêm loại cây</>
        }
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa loại cây" : "Thêm loại cây mới"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {!isEdit && (
            <div className="space-y-1">
              <Label>Mã loại cây (2-3 chữ cái)</Label>
              <Input {...register("code")} placeholder="VD: MT" maxLength={3} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
          )}
          <div className="space-y-1">
            <Label>Tên loại cây</Label>
            <Input {...register("name")} placeholder="VD: Trầu bà" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
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
