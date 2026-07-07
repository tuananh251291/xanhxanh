"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Loader2 } from "lucide-react";
import { ROLE_LABELS } from "@/types";
import { toast } from "sonner";

const ASSIGNABLE_ROLES = ["ADMIN", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "SALE", "MOI_TRUONG", "DIEU_PHOI"] as const;
const ASSIGNABLE_ROLE_LABELS = Object.fromEntries(
  ASSIGNABLE_ROLES.map((r) => [r, ROLE_LABELS[r]])
) as Record<(typeof ASSIGNABLE_ROLES)[number], string>;

const schema = z.object({
  name: z.string().min(2, "Tên tối thiểu 2 ký tự"),
  email: z.string().email("Email không hợp lệ"),
  role: z.enum(ASSIGNABLE_ROLES),
  isActive: z.boolean(),
  password: z.union([z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"), z.literal("")]).optional(),
});

type FormData = z.infer<typeof schema>;

type EditableUser = {
  id: string;
  name: string;
  email: string;
  role: (typeof ASSIGNABLE_ROLES)[number];
  isActive: boolean;
};

export default function EditUserDialog({ user }: { user: EditableUser }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      password: "",
    },
  });

  const role = watch("role");
  const isActive = watch("isActive");

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          role: data.role,
          isActive: data.isActive,
          ...(data.password ? { password: data.password } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success("Đã cập nhật tài khoản");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) reset(); }}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Pencil className="w-3.5 h-3.5 mr-1" /> Chỉnh sửa
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa tài khoản</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label>Họ tên</Label>
            <Input {...register("name")} placeholder="Nguyễn Văn A" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input {...register("email")} type="email" placeholder="email@company.com" />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Mật khẩu mới (để trống nếu không đổi)</Label>
            <Input {...register("password")} type="password" placeholder="Tối thiểu 6 ký tự" />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Vai trò</Label>
            <Select items={ASSIGNABLE_ROLE_LABELS} value={role} onValueChange={(v) => setValue("role", v as FormData["role"])}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ASSIGNABLE_ROLE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="edit-user-active" checked={isActive} onCheckedChange={(v) => setValue("isActive", v === true)} />
            <Label htmlFor="edit-user-active" className="cursor-pointer">Tài khoản đang hoạt động</Label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" className="flex-1 bg-primary hover:bg-primary-hover" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
