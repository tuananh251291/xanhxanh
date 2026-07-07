import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isMediumOrderInProgress } from "@/lib/medium-orders";
import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function CurrentMediumOrderPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "MOI_TRUONG") redirect("/dashboard");

  const myOrders = await prisma.mediumOrder.findMany({
    where: { confirmedById: session.user.id, confirmedAt: { not: null } },
    include: { days: { select: { handedOverAt: true, confirmedAt: true } } },
    orderBy: { confirmedAt: "desc" },
  });
  const activeOrder = myOrders.find((o) => isMediumOrderInProgress(o));

  if (activeOrder) redirect(`/medium-orders/${activeOrder.id}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-secondary-foreground" /> Bàn giao môi trường
        </h1>
      </div>
      <Card>
        <CardContent className="py-16 text-center text-text-muted">
          <FlaskConical className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Bạn không có đơn sản xuất môi trường nào đang xử lý</p>
          <Link href="/medium-orders">
            <Button variant="outline" className="mt-4">Xem danh sách đơn đặt hàng</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
