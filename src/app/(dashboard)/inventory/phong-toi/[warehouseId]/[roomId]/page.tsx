import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Moon, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import PhongToiLotsTable from "./phong-toi-lots-table";

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
        // quantity > 0 — lô Admin sửa về 0 (hoặc đã hết qua nghiệp vụ khác) coi như không còn nằm trong
        // phòng tối nữa, phải biến mất khỏi danh sách — xem giải thích đầy đủ ở
        // src/app/(dashboard)/warehouses/page.tsx cùng shelfInclude.
        where: { status: "ACTIVE", quantity: { gt: 0 } },
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
            <PhongToiLotsTable
              lots={room.lots.map((lot) => ({ ...lot, enteredAt: lot.enteredAt.toISOString() }))}
              isPhongNhiem={isPhongNhiem}
              canEdit={isAdminRole(role)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
