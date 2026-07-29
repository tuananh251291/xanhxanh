"use client";

import { useState, useRef } from "react";
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

// Đồng bộ với WORKPLACE_ROLES ở users/page.tsx và src/app/api/users/[id]/route.ts. KHO_THANH_PHAM gán
// được nhưng chỉ mang tính hiển thị/lưu trữ, không giới hạn phạm vi thao tác.
const WORKPLACE_ROLES = ["KHO_MO", "CAY_MO", "MOI_TRUONG", "SALE", "KHO_THANH_PHAM"] as const;
const THANH_PHAM_WORKPLACE_ROLES = ["SALE", "KHO_THANH_PHAM"] as const;
const NO_WAREHOUSE = "NONE";

// Chỉ để báo hiệu "tài khoản đã có mật khẩu", KHÔNG phản ánh số ký tự thật — mật khẩu chỉ lưu dạng
// băm (bcrypt) nên không có cách nào biết lại độ dài gốc. Bấm vào ô sẽ tự xoá hết để nhập mật khẩu mới.
const PASSWORD_PLACEHOLDER = "•".repeat(10);

const schema = z.object({
  name: z.string().min(2, "Tên tối thiểu 2 ký tự"),
  email: z.string().email("Email không hợp lệ"),
  role: z.enum(ASSIGNABLE_ROLES),
  code: z.string().min(1, "Nhập mã nhân viên"),
  isActive: z.boolean(),
  password: z.string(),
});

type FormData = z.infer<typeof schema>;

type WarehouseOption = { id: string; code: string; name: string };

export type EditableUser = {
  id: string;
  name: string;
  email: string;
  role: (typeof ASSIGNABLE_ROLES)[number];
  code: string;
  isActive: boolean;
  workplaceWarehouseId?: string | null;
};

export default function EditUserDialog({
  user,
  sanXuatWarehouses,
  thanhPhamWarehouses,
}: {
  user: EditableUser;
  sanXuatWarehouses: WarehouseOption[];
  thanhPhamWarehouses: WarehouseOption[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workplaceWarehouseId, setWorkplaceWarehouseId] = useState(user.workplaceWarehouseId ?? NO_WAREHOUSE);
  const router = useRouter();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user.name,
      email: user.email,
      role: user.role,
      code: user.code,
      isActive: user.isActive,
      password: PASSWORD_PLACEHOLDER,
    },
  });

  const role = watch("role");
  const isActive = watch("isActive");
  const prevRoleRef = useRef(user.role);
  const isWorkplaceRole = WORKPLACE_ROLES.includes(role as (typeof WORKPLACE_ROLES)[number]);
  const warehouseOptions = THANH_PHAM_WORKPLACE_ROLES.includes(role as (typeof THANH_PHAM_WORKPLACE_ROLES)[number])
    ? thanhPhamWarehouses
    : sanXuatWarehouses;

  const onRoleChange = async (newRole: FormData["role"]) => {
    setValue("role", newRole);
    // Đổi sang vai trò khác vai trò gốc → gợi ý mã kế tiếp theo vai trò mới, Admin vẫn sửa lại được.
    // Đổi lại về đúng vai trò gốc thì trả lại mã gốc thay vì để mã gợi ý cũ.
    if (newRole === prevRoleRef.current) return;
    prevRoleRef.current = newRole;
    // Vai trò mới có thể dùng khác loại kho (VD từ Cấy mô sang Sale) — reset lựa chọn để Admin chọn
    // lại tường minh thay vì lỡ giữ nguyên 1 kho không hợp lệ với vai trò mới.
    setWorkplaceWarehouseId(NO_WAREHOUSE);
    if (newRole === user.role) {
      setValue("code", user.code);
      setWorkplaceWarehouseId(user.workplaceWarehouseId ?? NO_WAREHOUSE);
      return;
    }
    try {
      const res = await fetch(`/api/users/next-code?role=${newRole}`);
      if (res.ok) {
        const { code } = await res.json();
        setValue("code", code);
      }
    } catch {
      // Bỏ qua lỗi gợi ý — Admin vẫn nhập tay được.
    }
  };

  const onSubmit = async (data: FormData) => {
    // Còn nguyên placeholder (chưa bấm vào) hoặc đã xoá về rỗng (bấm vào rồi đổi ý) → không đổi mật khẩu.
    let newPassword: string | undefined;
    if (data.password !== PASSWORD_PLACEHOLDER && data.password.length > 0) {
      if (data.password.length < 6) {
        toast.error("Mật khẩu tối thiểu 6 ký tự");
        return;
      }
      newPassword = data.password;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          role: data.role,
          code: data.code,
          isActive: data.isActive,
          ...(newPassword ? { password: newPassword } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message ?? "Có lỗi xảy ra");
        return;
      }

      // Địa điểm làm việc dùng API riêng (PATCH { workplaceWarehouseId }) — chỉ gửi khi vai trò cuối
      // cùng còn thuộc nhóm có địa điểm làm việc và giá trị thực sự thay đổi.
      const isFinalWorkplaceRole = WORKPLACE_ROLES.includes(data.role as (typeof WORKPLACE_ROLES)[number]);
      const workplaceChanged = workplaceWarehouseId !== (user.workplaceWarehouseId ?? NO_WAREHOUSE);
      if (isFinalWorkplaceRole && workplaceChanged) {
        const wpRes = await fetch(`/api/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workplaceWarehouseId: workplaceWarehouseId === NO_WAREHOUSE ? null : workplaceWarehouseId }),
        });
        if (!wpRes.ok) {
          const err = await wpRes.json();
          toast.error(err.message ?? "Đã cập nhật tài khoản nhưng không đổi được địa điểm làm việc");
          setOpen(false);
          router.refresh();
          return;
        }
      }

      toast.success("Đã cập nhật tài khoản");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          reset();
          prevRoleRef.current = user.role;
          setWorkplaceWarehouseId(user.workplaceWarehouseId ?? NO_WAREHOUSE);
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" title="Chỉnh sửa" />}>
        <Pencil className="w-3.5 h-3.5" />
        <span className="sr-only">Chỉnh sửa</span>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa tài khoản</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} method="post" className="space-y-4 mt-2">
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
            <Label>Mật khẩu mới (để nguyên nếu không đổi)</Label>
            <Input
              {...register("password")}
              type="password"
              autoComplete="new-password"
              placeholder="Tối thiểu 6 ký tự"
              onFocus={(e) => {
                if (e.target.value === PASSWORD_PLACEHOLDER) setValue("password", "");
              }}
            />
          </div>
          <div className="space-y-1">
            <Label>Vai trò</Label>
            <Select items={ASSIGNABLE_ROLE_LABELS} value={role} onValueChange={(v) => onRoleChange(v as FormData["role"])}>
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
          <div className="space-y-1">
            <Label>Mã nhân viên</Label>
            <Input {...register("code")} placeholder="VD: NVCM070" />
            {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
          </div>
          {isWorkplaceRole && (
            <div className="space-y-1">
              <Label>Vị trí làm việc</Label>
              <Select
                items={[{ value: NO_WAREHOUSE, label: "— Chưa gán —" }, ...warehouseOptions.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))]}
                value={workplaceWarehouseId}
                onValueChange={(v) => setWorkplaceWarehouseId(v as string)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn địa điểm làm việc" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_WAREHOUSE}>— Chưa gán —</SelectItem>
                  {warehouseOptions.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
