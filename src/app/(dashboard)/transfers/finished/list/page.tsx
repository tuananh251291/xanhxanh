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
  PENDING: { label: "Đã bàn giao / Chưa xác nhận", color: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "Bàn giao thành công", color: "bg-green-100 text-green-700" },
  REJECTED: { label: "Bị từ chối", color: "bg-red-100 text-red-700" },
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
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-green-600" /> Phiếu bàn giao thành phẩm
          </h1>
          <p className="text-gray-500 text-sm mt-1">{transfers.length} phiếu</p>
        </div>
      </div>

      {transfers.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Chưa có phiếu bàn giao thành phẩm nào</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-green-700">
                    <th className="text-left px-4 py-3 font-medium text-white">Mã phiếu</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Người bàn giao</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Thời gian</th>
                    <th className="text-right px-4 py-3 font-medium text-white">Tổng số lượng</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Trạng thái</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 even:bg-green-50 hover:bg-green-100">
                      <td className="px-4 py-3 font-mono font-medium text-blue-700">{t.code}</td>
                      <td className="px-4 py-3 text-gray-700">{t.fromUser.name}</td>
                      <td className="px-4 py-3 text-gray-500">{format(t.transferredAt, "dd/MM/yyyy HH:mm", { locale: vi })}</td>
                      <td className="px-4 py-3 text-right font-medium">{t.items.reduce((s, i) => s + i.quantity, 0).toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3"><Badge className={STATUS_LABELS[t.status].color}>{STATUS_LABELS[t.status].label}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/transfers/finished/${t.id}`}>
                          <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700">
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
