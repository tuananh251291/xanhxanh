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
import { Leaf, Loader2 } from "lucide-react";
import Link from "next/link";
import { randomGreetingQuote, randomGreetingBackground } from "@/lib/greetings";

const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

type LoginForm = z.infer<typeof loginSchema>;

const GREETING_DURATION_MS = 5000;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [greetingQuote, setGreetingQuote] = useState<string | null>(null);
  const [greetingBg, setGreetingBg] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

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
        setError("Email hoặc mật khẩu không đúng");
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
              <Label htmlFor="password">Mật khẩu</Label>
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
