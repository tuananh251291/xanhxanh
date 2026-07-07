"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { KeyRound, Loader2, Save, UserCircle, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_SIZE = 1_500_000; // ~1.5MB

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: z.string().min(6, "Mật khẩu mới tối thiểu 6 ký tự"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AccountPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const {
    register, handleSubmit, reset, formState: { errors },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const currentAvatar = avatarPreview ?? session?.user?.avatar ?? undefined;
  const userName = session?.user?.name ?? "";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Ảnh quá lớn, vui lòng chọn ảnh dưới 1.5MB");
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setAvatarPreview(dataUrl);
    setUploadingAvatar(true);
    try {
      const res = await fetch("/api/account/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: dataUrl }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message ?? "Cập nhật ảnh thất bại");
        setAvatarPreview(null);
        return;
      }
      await update();
      router.refresh();
      toast.success("Đã cập nhật ảnh đại diện");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Xóa ảnh thất bại");
        return;
      }
      setAvatarPreview(null);
      await update();
      router.refresh();
      toast.success("Đã xóa ảnh đại diện");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onSubmitPassword = async (data: PasswordForm) => {
    setSavingPassword(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message ?? "Đổi mật khẩu thất bại");
        return;
      }
      toast.success("Đã đổi mật khẩu");
      reset();
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tài khoản của tôi</h1>
        <p className="text-text-secondary text-sm mt-1">Quản lý ảnh đại diện và mật khẩu đăng nhập</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCircle className="w-4 h-4" /> Ảnh đại diện
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar size="lg" className="size-16">
            <AvatarImage src={currentAvatar} alt={userName} />
            <AvatarFallback className="text-lg">{userName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingAvatar ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Đổi ảnh
            </Button>
            {currentAvatar && (
              <Button type="button" variant="ghost" disabled={uploadingAvatar} onClick={handleRemoveAvatar}>
                <Trash2 className="w-4 h-4 mr-2" /> Xóa
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Đổi mật khẩu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmitPassword)} className="space-y-4 max-w-sm">
            <div className="space-y-1">
              <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
              <Input id="currentPassword" type="password" placeholder="••••••••" {...register("currentPassword")} />
              {errors.currentPassword && <p className="text-sm text-destructive">{errors.currentPassword.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="newPassword">Mật khẩu mới</Label>
              <Input id="newPassword" type="password" placeholder="••••••••" {...register("newPassword")} />
              {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
              <Input id="confirmPassword" type="password" placeholder="••••••••" {...register("confirmPassword")} />
              {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
            </div>
            <Button type="submit" disabled={savingPassword} className="bg-primary hover:bg-primary-hover">
              {savingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Đổi mật khẩu
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
