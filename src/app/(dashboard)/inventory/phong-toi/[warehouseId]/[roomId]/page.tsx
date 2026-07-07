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
import { isPageAllowed } from "@/lib/permissions";

export default async function PhongToiRoomDetailPage({ params }: { params: Promise<{ warehouseId: string; roomId: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/phong-toi"))) redirect("/dashboard");

  const { warehouseId, roomId } = await params;
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      warehouse: { select: { name: true } },
      assignedStaff: { select: { name: true, code: true } },
      lots: {
        where: { status: "ACTIVE" },
        include: {
          plantType: { select: { code: true, name: true } },
          instruction: { select: { code: true } },
        },
        orderBy: { enteredAt: "desc" },
      },
    },
  });
  if (!room || room.warehouseId !== warehouseId || (room.type !== "PHONG_TOI" && room.type !== "PHONG_NHIEM")) notFound();
  const isPhongNhiem = room.type === "PHONG_NHIEM";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/inventory/phong-toi/${warehouseId}`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Moon className="w-6 h-6 text-primary-strong" /> {isPhongNhiem ? room.name : (room.assignedStaff?.name ?? "—")}
          </h1>
          <p className="text-text-secondary text-sm">
            {room.warehouse.name} — {room.name} · {room.lots.length} lô
          </p>
        </div>
      </div>

      {room.lots.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <Moon className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>{isPhongNhiem ? "Không có lô nào trong phòng nhiễm" : "Không có lô nào trong phòng tối của nhân viên này"}</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã lô sản phẩm</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Chỉ định cấy</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Quy cách</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Ngày nhập kho tối</th>
                  </tr>
                </thead>
                <tbody>
                  {room.lots.map((lot) => (
                    <tr key={lot.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                      <td className="px-4 py-3 font-mono font-medium text-info-foreground">{lot.code}</td>
                      <td className="px-4 py-3 font-mono text-text-secondary">{lot.instruction?.code ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-text-secondary">{lot.plantType.code}</td>
                      <td className="px-4 py-3 text-foreground">{lot.plantType.name}</td>
                      <td className="px-4 py-3"><Badge variant="secondary">{lot.stageCode}</Badge></td>
                      <td className="px-4 py-3 text-right font-medium">{lot.quantity.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3 text-text-secondary">{format(lot.enteredAt, "dd/MM/yyyy", { locale: vi })}</td>
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
