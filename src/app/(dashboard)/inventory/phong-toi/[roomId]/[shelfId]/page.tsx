import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Moon, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { STAGE_LABELS } from "@/types";
import { isPageAllowed } from "@/lib/permissions";

export default async function PhongToiShelfPage({ params }: { params: Promise<{ roomId: string; shelfId: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/phong-toi"))) redirect("/dashboard");

  const { roomId, shelfId } = await params;
  const shelf = await prisma.shelf.findUnique({
    where: { id: shelfId },
    include: {
      room: { select: { id: true, type: true, name: true, warehouse: { select: { name: true } } } },
      assignedStaff: { select: { name: true, code: true } },
      lots: {
        where: { status: "ACTIVE" },
        include: {
          plantType: { select: { code: true, name: true } },
          instruction: { select: { code: true } },
          _count: { select: { contaminations: true } },
        },
        orderBy: { enteredAt: "desc" },
      },
    },
  });
  if (!shelf || !shelf.room || shelf.roomId !== roomId || shelf.room.type !== "PHONG_TOI") notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/inventory/phong-toi/${roomId}`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Moon className="w-6 h-6 text-indigo-600" /> {shelf.assignedStaff?.name ?? "—"}
          </h1>
          <p className="text-gray-500 text-sm">
            {shelf.room.warehouse.name} — {shelf.room.name} · {shelf.lots.length} lô
          </p>
        </div>
      </div>

      {shelf.lots.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <Moon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Không có lô nào trong phòng tối của nhân viên này</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-green-700">
                    <th className="text-left px-4 py-3 font-medium text-white">Mã lô</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Loại cây</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Chỉ định</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Giai đoạn</th>
                    <th className="text-right px-4 py-3 font-medium text-white">Số lượng</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Ngày nhập</th>
                    <th className="text-right px-4 py-3 font-medium text-white">Lần báo nhiễm</th>
                  </tr>
                </thead>
                <tbody>
                  {shelf.lots.map((lot) => (
                    <tr key={lot.id} className="border-b last:border-0 even:bg-green-50 hover:bg-green-100">
                      <td className="px-4 py-3 font-mono font-medium text-blue-700">{lot.code}</td>
                      <td className="px-4 py-3 text-gray-700">{lot.plantType.name}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{lot.instruction?.code ?? "—"}</td>
                      <td className="px-4 py-3"><Badge variant="secondary">{STAGE_LABELS[lot.stage]} · {lot.stageCode}</Badge></td>
                      <td className="px-4 py-3 text-right font-medium">{lot.quantity.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3 text-gray-500">{format(lot.enteredAt, "dd/MM/yyyy", { locale: vi })}</td>
                      <td className="px-4 py-3 text-right">{lot._count.contaminations > 0 ? <Badge className="bg-red-100 text-red-700">{lot._count.contaminations}</Badge> : "—"}</td>
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
