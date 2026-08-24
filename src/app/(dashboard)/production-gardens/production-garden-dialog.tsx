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

const NONE = "NONE";

const schema = z.object({
  name: z.string().min(2),
  address: z.string().min(2),
  managerId: z.string(),
});

type FormData = z.infer<typeof schema>;
type Manager = { id: string; code: string; name: string };
type Garden = { id: string; code: string; name: string; address: string; managerId: string | null };

export default function ProductionGardenDialog({ item, managers }: { item?: Garden; managers: Manager[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isEdit = !!item;

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: item
      ? { name: item.name, address: item.address, managerId: item.managerId ?? NONE }
      : { name: "", address: "", managerId: NONE },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const payload = { name: data.name, address: data.address, managerId: data.managerId === NONE ? null : data.managerId };
      const res = await fetch(isEdit ? `/api/production-gardens/${item!.id}` : "/api/production-gardens", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success(isEdit ? "Cập nhật thành công" : "Thêm Vườn sản xuất thành công");
      setOpen(false); reset(); router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={isEdit ? <Button variant="ghost" size="sm" /> : <Button className="bg-primary hover:bg-primary-hover" />}>
        {isEdit
          ? <><Pencil className="w-4 h-4 mr-2" />Chỉnh sửa</>
          : <><Plus className="w-4 h-4 mr-2" />Thêm Vườn sản xuất</>
        }
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Sửa Vườn sản xuất" : "Thêm Vườn sản xuất mới"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {isEdit ? (
            <div className="space-y-1">
              <Label>Mã vườn</Label>
              <p className="text-sm font-mono text-text-secondary">{item.code}</p>
            </div>
          ) : (
            <p className="text-xs text-text-secondary bg-muted rounded-md px-3 py-2">
              Mã vườn sẽ tự động sinh theo mẫu VSX01–VSX99.
            </p>
          )}
          <div className="space-y-1">
            <Label>Tên vườn</Label>
            <Input {...register("name")} placeholder="VD: Vườn Đà Lạt 1" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Địa chỉ</Label>
            <Input {...register("address")} placeholder="VD: Thôn X, xã Y, Lâm Đồng" />
            {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Quản lý vườn</Label>
            <Controller
              control={control}
              name="managerId"
              render={({ field }) => (
                <Select
                  items={[{ value: NONE, label: "— Chưa gán —" }, ...managers.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))]}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as string)}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Chưa gán —</SelectItem>
                    {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
            {managers.length === 0 && (
              <p className="text-xs text-text-muted">Chưa có tài khoản NV Quản lý vườn nào — tạo ở trang Người dùng trước.</p>
            )}
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
