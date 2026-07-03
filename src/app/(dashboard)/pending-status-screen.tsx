"use client";

import { signOut } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, XCircle, LogOut } from "lucide-react";
import type { UserStatus } from "@prisma/client";

export default function PendingStatusScreen({ status }: { status: UserStatus }) {
  const isRejected = status === "REJECTED";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <Card className="w-full max-w-md shadow-lg text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className={isRejected ? "bg-red-100 text-red-600 p-3 rounded-xl" : "bg-yellow-100 text-yellow-600 p-3 rounded-xl"}>
              {isRejected ? <XCircle className="w-8 h-8" /> : <Clock className="w-8 h-8" />}
            </div>
          </div>
          <CardTitle className="text-xl font-bold text-gray-800">
            {isRejected ? "Tài khoản bị từ chối" : "Tài khoản đang chờ duyệt"}
          </CardTitle>
          <CardDescription className="text-gray-500">
            {isRejected
              ? "Yêu cầu tạo tài khoản của bạn đã bị Admin từ chối. Liên hệ Admin nếu cần hỗ trợ."
              : "Tài khoản của bạn đã đăng ký thành công và đang chờ Admin duyệt, phân loại vai trò. Vui lòng quay lại sau."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut className="w-4 h-4 mr-2" /> Đăng xuất
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
