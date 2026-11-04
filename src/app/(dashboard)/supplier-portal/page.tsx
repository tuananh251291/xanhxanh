import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "lucide-react";

// Trang chủ tài khoản NCC (role NHA_CUNG_CAP) — chưa có nghiệp vụ, chỉ cho biết tài khoản đang gắn với NCC nào.
export default async function SupplierPortalPage() {
  const session = await auth();
  if (session?.user?.role !== "NHA_CUNG_CAP") redirect("/dashboard");
  const supplier = await prisma.supplier.findUnique({ where: { userId: session.user.id }, select: { code: true, name: true } });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <Truck className="w-6 h-6 text-secondary-foreground" /> Nhà cung cấp
      </h1>
      {supplier ? (
        <Card>
          <CardHeader>
            <CardTitle>{supplier.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-text-secondary">
            <p>Mã nhà cung cấp: <span className="font-mono font-medium text-info-foreground">{supplier.code}</span></p>
            <p>Các chức năng dành cho nhà cung cấp sẽ được bổ sung sau.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-text-secondary">Tài khoản chưa được gắn với nhà cung cấp nào. Vui lòng liên hệ quản lý.</CardContent>
        </Card>
      )}
    </div>
  );
}
