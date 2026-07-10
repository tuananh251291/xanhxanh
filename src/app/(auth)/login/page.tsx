"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Leaf, Loader2, KeyRound } from "lucide-react";
import Link from "next/link";
import { randomGreetingQuote, randomGreetingBackground } from "@/lib/greetings";

function ForgotPasswordDialog({ initialEmail }: { initialEmail: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const openDialog = () => {
    setEmail(initialEmail);
    setResult(null);
    setOpen(true);
  };

  const submit = async () => {
    if (!email) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      setResult(json.message ?? "Đã gửi yêu cầu.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" onClick={openDialog} className="text-primary-strong hover:underline font-medium text-sm">
        Quên mật khẩu?
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> Quên mật khẩu</DialogTitle>
          </DialogHeader>
          {result ? (
            <p className="text-sm text-text-secondary py-2">{result}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Hệ thống không tự gửi mật khẩu mới — Admin cấp cao sẽ nhận được thông báo và liên hệ trực
                tiếp (ngoài hệ thống) để cấp lại mật khẩu cho bạn.
              </p>
              <div className="space-y-1">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="email@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button
                type="button"
                className="w-full bg-primary hover:bg-primary-hover"
                disabled={submitting || !email}
                onClick={submit}
              >
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Gửi yêu cầu
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

type LoginForm = z.infer<typeof loginSchema>;

const GREETING_DURATION_MS = 3000;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [greetingQuote, setGreetingQuote] = useState<string | null>(null);
  const [greetingBg, setGreetingBg] = useState("");

  const { register, handleSubmit, watch, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const typedEmail = watch("email") ?? "";

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError("");
    try {
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });
      if (result?.error) {
        setError(
          result.code === "account-locked"
            ? "Tài khoản đã bị khóa do đăng nhập sai mật khẩu quá 5 lần — vui lòng liên hệ Admin cấp cao để mở lại."
            : "Email hoặc mật khẩu không đúng"
        );
        setLoading(false);
      } else {
        setGreetingBg(randomGreetingBackground());
        setGreetingQuote(randomGreetingQuote());
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, GREETING_DURATION_MS);
      }
    } catch {
      setLoading(false);
    }
  };

  if (greetingQuote) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${greetingBg} p-4`}>
        <div className="flex flex-col items-center text-center max-w-md animate-in fade-in zoom-in-95 duration-500">
          <div className="bg-primary text-primary-foreground p-4 rounded-2xl mb-6 shadow-lg">
            <Leaf className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">Xin chào!</h1>
          <p className="text-text-secondary text-base leading-relaxed">{greetingQuote}</p>
          <Loader2 className="w-5 h-5 mt-8 animate-spin text-text-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-bg to-primary-light p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="bg-primary text-primary-foreground p-3 rounded-xl">
              <Leaf className="w-8 h-8" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">Xanh Xanh</CardTitle>
          <CardDescription className="text-text-secondary">
            Hệ thống quản lý nuôi cấy mô – kho – bán hàng
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@company.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mật khẩu</Label>
                <ForgotPasswordDialog initialEmail={typedEmail} />
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            {error && (
              <div className="bg-danger-light border border-danger-light text-destructive text-sm px-3 py-2 rounded-md">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full bg-primary hover:bg-primary-hover" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Đăng nhập
            </Button>
          </form>
          <p className="text-center text-sm text-text-secondary mt-4">
            Chưa có tài khoản?{" "}
            <Link href="/register" className="text-primary-strong hover:underline font-medium">
              Đăng ký
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
