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
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type MediumType = FormData & { id: string; isActive: boolean };

export default function MediumTypeDialog({ item }: { item?: MediumType }) {
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
      const res = await fetch("/api/medium-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: item!.id, ...data } : data),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success(isEdit ? "Cập nhật thành công" : "Thêm môi trường thành công");
      setOpen(false); reset(); router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        {isEdit
          ? <Button variant="ghost" size="sm"><Pencil className="w-4 h-4" /></Button>
          : <Button className="bg-green-600 hover:bg-green-700"><Plus className="w-4 h-4 mr-2" />Thêm môi trường</Button>
        }
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Sửa môi trường" : "Thêm môi trường mới"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Mã môi trường</Label>
              <Input {...register("code")} placeholder="MT001" disabled={isEdit} />
              {errors.code && <p className="text-xs text-red-500">{errors.code.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Tên</Label>
              <Input {...register("name")} placeholder="MS cơ bản" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Mô tả</Label>
            <Input {...register("description")} placeholder="Ghi chú..." />
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
