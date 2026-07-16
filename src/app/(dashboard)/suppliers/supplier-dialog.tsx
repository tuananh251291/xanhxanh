"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

const RETURN_OPTIONS = [
  { value: "no", label: "Không được trả hàng" },
  { value: "yes", label: "Được trả hàng" },
];

const schema = z
  .object({
    code: z.string().min(2),
    name: z.string().min(2),
    allowsReturn: z.enum(["yes", "no"]),
    returnWindowDays: z.string().optional(),
  })
  .refine((d) => d.allowsReturn === "no" || (!!d.returnWindowDays && Number(d.returnWindowDays) > 0), {
    message: "Cần nhập số ngày được phép trả hàng (lớn hơn 0)",
    path: ["returnWindowDays"],
  });

type FormData = z.infer<typeof schema>;
type Supplier = { id: string; code: string; name: string; isActive: boolean; allowsReturn: boolean; returnWindowDays: number | null };

export default function SupplierDialog({ item }: { item?: Supplier }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isEdit = !!item;

  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: item
      ? {
          code: item.code,
          name: item.name,
          allowsReturn: item.allowsReturn ? "yes" : "no",
          returnWindowDays: item.returnWindowDays ? String(item.returnWindowDays) : "",
        }
      : { allowsReturn: "no" },
  });
  const allowsReturn = watch("allowsReturn");

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const payload = {
        ...(isEdit ? {} : { code: data.code }),
        name: data.name,
        allowsReturn: data.allowsReturn === "yes",
        returnWindowDays: data.allowsReturn === "yes" ? Number(data.returnWindowDays) : null,
      };
      const res = await fetch(isEdit ? `/api/suppliers/${item!.id}` : "/api/suppliers", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success(isEdit ? "Cập nhật thành công" : "Thêm nhà cung cấp thành công");
      setOpen(false); reset(); router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={isEdit ? <Button variant="ghost" size="sm" /> : <Button className="bg-primary hover:bg-primary-hover" />}>
        {isEdit
          ? <><Pencil className="w-4 h-4 mr-2" />Chỉnh sửa</>
          : <><Plus className="w-4 h-4 mr-2" />Thêm nhà cung cấp</>
        }
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp mới"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label>Mã nhà cung cấp</Label>
            <Input {...register("code")} placeholder="VD: NCC001" disabled={isEdit} />
            {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Tên nhà cung cấp</Label>
            <Input {...register("name")} placeholder="VD: Vườn ươm Đà Lạt" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Trả hàng</Label>
            <Controller
              control={control}
              name="allowsReturn"
              render={({ field }) => (
                <Select items={RETURN_OPTIONS} value={field.value} onValueChange={(v) => field.onChange(v as string)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RETURN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {allowsReturn === "yes" && (
            <div className="space-y-1">
              <Label>Ngày được phép trả hàng (kể từ ngày nhập)</Label>
              <Input type="number" min={1} {...register("returnWindowDays")} placeholder="VD: 7" />
              {errors.returnWindowDays && <p className="text-xs text-destructive">{errors.returnWindowDays.message}</p>}
            </div>
          )}
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
