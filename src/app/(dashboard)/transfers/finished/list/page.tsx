import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { isPageAllowed } from "@/lib/permissions";
import type { TransferStatus } from "@prisma/client";

const STATUS_LABELS: Record<TransferStatus, { label: string; color: string }> = {
  PENDING: { label: "Đã bàn giao / Chưa xác nhận", color: "bg-warning-light text-warning-foreground" },
  CONFIRMED: { label: "Bàn giao thành công", color: "bg-primary-light text-primary-strong" },
  REJECTED: { label: "Bị từ chối", color: "bg-danger-light text-destructive" },
};

export default async function TransferFinishedListPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/transfers/finished"))) redirect("/dashboard");

  const transfers = await prisma.transfer.findMany({
    where: { fromRoom: { type: "PHONG_RA_RE" } },
    include: {
      fromUser: { select: { name: true } },
      items: { select: { quantity: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/transfers/finished"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary-strong" /> Phiếu bàn giao thành phẩm
          </h1>
          <p className="text-text-secondary text-sm mt-1">{transfers.length} phiếu</p>
        </div>
      </div>

      {transfers.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Chưa có phiếu bàn giao thành phẩm nào</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã phiếu</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Người bàn giao</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Thời gian</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tổng số lượng</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Trạng thái</th>
                    <th className="px-4 py-3 font-bold text-base"></th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                      <td className="px-4 py-3 font-mono font-medium text-info-foreground">{t.code}</td>
                      <td className="px-4 py-3 text-foreground">{t.fromUser.name}</td>
                      <td className="px-4 py-3 text-text-secondary">{format(t.transferredAt, "dd/MM/yyyy HH:mm", { locale: vi })}</td>
                      <td className="px-4 py-3 text-right font-medium">{t.items.reduce((s, i) => s + i.quantity, 0).toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3"><Badge className={STATUS_LABELS[t.status].color}>{STATUS_LABELS[t.status].label}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/transfers/finished/${t.id}`}>
                          <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
                            <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
