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
import { UserPlus, Loader2 } from "lucide-react";
import { ROLE_LABELS } from "@/types";
import type { UserRole } from "@prisma/client";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(2, "Tên tối thiểu 2 ký tự"),
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
  // Danh sách đầy đủ vai trò gán được qua UI (trừ SUPER_ADMIN) — dropdown chỉ HIỆN đúng các lựa chọn
  // trong assignableRoles (xem prop dưới), server (POST /api/users) validate lại đúng theo người tạo.
  role: z.enum(["ADMIN", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "QUAN_LY_KHO_THANH_PHAM", "SALE", "MOI_TRUONG", "DIEU_PHOI", "HANH_CHINH_NHAN_SU", "NHAN_VIEN_SAN_XUAT", "NHAN_VIEN_QUAN_LY_VUON"]),
  code: z.string().min(1, "Nhập mã nhân viên"),
  workplaceWarehouseId: z.string().optional(),
  marketRoomIds: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof schema>;

type MarketRoom = { id: string; name: string; warehouseName: string };
type ThanhPhamWarehouse = { id: string; code: string; name: string; rooms: { id: string; name: string; type: string }[] };

export default function CreateUserDialog({ assignableRoles }: { assignableRoles: UserRole[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [thanhPhamWarehouses, setThanhPhamWarehouses] = useState<ThanhPhamWarehouse[]>([]);
  const router = useRouter();

  // Mật khẩu mặc định "demo123" cho mọi tài khoản mới — Admin vẫn sửa lại được trước khi tạo nếu muốn
  // đặt mật khẩu riêng cho nhân viên đó.
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { marketRoomIds: [], password: "demo123" },
  });

  const role = watch("role");
  const marketRoomIds = watch("marketRoomIds") ?? [];

  const onRoleChange = async (role: FormData["role"]) => {
    setValue("role", role);
    // Gợi ý mã kế tiếp theo vai trò để đỡ phải gõ từ đầu — Admin vẫn sửa lại được trước khi tạo.
    try {
      const res = await fetch(`/api/users/next-code?role=${role}`);
      if (res.ok) {
        const { code } = await res.json();
        setValue("code", code);
      }
    } catch {
      // Bỏ qua lỗi gợi ý — Admin vẫn nhập tay được.
    }

    // Sale làm việc với Kho thành phẩm (không phải Kho sản xuất) — nạp danh sách kho + Phòng thị trường
    // để gán sẵn lúc tạo, tránh phải cấu hình lại ở trang Người dùng/Kho & Kệ sau khi tạo xong.
    if (role === "SALE" && thanhPhamWarehouses.length === 0) {
      try {
        const res = await fetch("/api/warehouses?type=THANH_PHAM");
        if (res.ok) setThanhPhamWarehouses(await res.json());
      } catch {
        // Bỏ qua lỗi nạp danh sách — Admin vẫn gán được sau qua trang Người dùng/Kho & Kệ.
      }
    }
  };

  const toggleMarketRoom = (roomId: string) => {
    const next = marketRoomIds.includes(roomId) ? marketRoomIds.filter((id) => id !== roomId) : [...marketRoomIds, roomId];
    setValue("marketRoomIds", next);
  };

  const marketRooms: MarketRoom[] = thanhPhamWarehouses.flatMap((w) =>
    w.rooms.filter((r) => r.type === "PHONG_THI_TRUONG").map((r) => ({ id: r.id, name: r.name, warehouseName: w.name }))
  );

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const payload = data.role === "SALE" ? data : { ...data, workplaceWarehouseId: undefined, marketRoomIds: undefined };
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success("Tạo tài khoản thành công");
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="bg-primary hover:bg-primary-hover" />}>
        <UserPlus className="w-4 h-4 mr-2" />
        Thêm người dùng
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm người dùng mới</DialogTitle>
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
            <Label>Mật khẩu</Label>
            <Input {...register("password")} type="password" autoComplete="new-password" placeholder="Tối thiểu 6 ký tự" />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Vai trò</Label>
            <Select
              items={Object.fromEntries(assignableRoles.map((r) => [r, ROLE_LABELS[r]]))}
              onValueChange={(v) => onRoleChange(v as FormData["role"])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
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

          {role === "SALE" && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-1">
                <Label>Kho thành phẩm làm việc</Label>
                <Select
                  items={thanhPhamWarehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
                  onValueChange={(v) => setValue("workplaceWarehouseId", v as string)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn kho thành phẩm (không bắt buộc)" />
                  </SelectTrigger>
                  <SelectContent>
                    {thanhPhamWarehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Phòng thị trường được xem thêm</Label>
                {marketRooms.length === 0 ? (
                  <p className="text-xs text-text-muted">Chưa có Phòng thị trường nào trong hệ thống.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {marketRooms.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={marketRoomIds.includes(r.id)} onCheckedChange={() => toggleMarketRoom(r.id)} />
                        {r.name} ({r.warehouseName})
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" className="flex-1 bg-primary hover:bg-primary-hover" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Tạo tài khoản
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
