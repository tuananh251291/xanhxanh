import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sun, Layers } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { vi } from "date-fns/locale";
import { STAGE_LABELS } from "@/types";

function expiryClass(expectedMoveAt: Date | null): string {
  if (!expectedMoveAt) return "text-gray-400";
  const daysLeft = differenceInCalendarDays(expectedMoveAt, new Date());
  if (daysLeft < 0) return "text-red-600 font-semibold";
  if (daysLeft <= 3) return "text-orange-600 font-semibold";
  return "text-gray-400";
}

export default async function KhoSangPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!["ADMIN", "KY_THUAT", "KHO_MO", "DIEU_PHOI"].includes(role ?? "")) redirect("/dashboard");

  const warehouses = await prisma.warehouse.findMany({
    where: { type: "KHO_SANG", isActive: true },
    include: {
      shelves: {
        where: { isActive: true },
        include: {
          lots: {
            where: { status: "ACTIVE" },
            include: { plantType: { select: { code: true, name: true } } },
            orderBy: { enteredAt: "asc" },
          },
        },
        orderBy: [{ rowNumber: "asc" }, { colNumber: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  const totalLots = warehouses.flatMap((w) => w.shelves.flatMap((s) => s.lots));
  const totalMother = totalLots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.quantity, 0);
  const totalFinished = totalLots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sun className="w-6 h-6 text-yellow-500" /> Kho sáng
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Tổng: {totalLots.length} lô · Mẫu mẹ: {totalMother.toLocaleString("vi-VN")} · Thành phẩm: {totalFinished.toLocaleString("vi-VN")}
        </p>
      </div>

      {/* Summary by plant type */}
      <Card>
        <CardHeader><CardTitle className="text-base">Tổng hợp theo loại cây</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            const byType: Record<string, { name: string; mother: number; finished: number }> = {};
            for (const lot of totalLots) {
              const key = lot.plantTypeId;
              if (!byType[key]) byType[key] = { name: `${lot.plantType.name} (${lot.plantType.code})`, mother: 0, finished: 0 };
              if (lot.stage === "MAU_ME") byType[key].mother += lot.quantity;
              else byType[key].finished += lot.quantity;
            }
            const entries = Object.values(byType);
            if (entries.length === 0) return <p className="text-gray-400 text-sm">Kho trống</p>;
            return (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {entries.map((e) => (
                  <div key={e.name} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                    <span className="font-medium text-sm">{e.name}</span>
                    <div className="flex gap-2 text-xs">
                      {e.mother > 0 && <Badge className="bg-purple-100 text-purple-700">MM: {e.mother.toLocaleString("vi-VN")}</Badge>}
                      {e.finished > 0 && <Badge className="bg-green-100 text-green-700">TP: {e.finished.toLocaleString("vi-VN")}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Per warehouse and shelf */}
      {warehouses.map((warehouse) => (
        <div key={warehouse.id} className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Layers className="w-5 h-5 text-yellow-500" /> {warehouse.name}
          </h2>
          {warehouse.shelves.length === 0 ? (
            <p className="text-sm text-gray-400 pl-2">Chưa có kệ</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {warehouse.shelves.map((shelf) => {
                const shelfMother = shelf.lots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.quantity, 0);
                const shelfFinished = shelf.lots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.quantity, 0);
                return (
                  <Card key={shelf.id} className={shelf.lots.length === 0 ? "opacity-50" : ""}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-mono">{shelf.code}</CardTitle>
                        <span className="text-xs text-gray-500">{shelf.name}</span>
                      </div>
                      {shelf.capacity && (
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-green-500 rounded-full h-1.5"
                            style={{ width: `${Math.min(100, ((shelfMother + shelfFinished) / shelf.capacity) * 100)}%` }}
                          />
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="pt-0">
                      {shelf.lots.length === 0 ? (
                        <p className="text-xs text-gray-400">Trống</p>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex gap-2 text-xs">
                            {shelfMother > 0 && <Badge className="bg-purple-100 text-purple-700">MM: {shelfMother.toLocaleString("vi-VN")}</Badge>}
                            {shelfFinished > 0 && <Badge className="bg-green-100 text-green-700">TP: {shelfFinished.toLocaleString("vi-VN")}</Badge>}
                          </div>
                          <div className="space-y-0.5 mt-1">
                            {shelf.lots.slice(0, 5).map((lot) => {
                              const daysLeft = lot.expectedMoveAt
                                ? differenceInCalendarDays(lot.expectedMoveAt, new Date())
                                : null;
                              return (
                                <div key={lot.id} className="flex items-center justify-between text-xs text-gray-600">
                                  <span className="font-mono">{lot.code}</span>
                                  <span>{lot.quantity.toLocaleString("vi-VN")}</span>
                                  <span className={expiryClass(lot.expectedMoveAt)}>
                                    {daysLeft === null
                                      ? format(lot.enteredAt, "dd/MM", { locale: vi })
                                      : daysLeft < 0
                                        ? `Quá hạn ${Math.abs(daysLeft)}d`
                                        : daysLeft <= 3
                                          ? `Còn ${daysLeft}d`
                                          : format(lot.enteredAt, "dd/MM", { locale: vi })}
                                  </span>
                                </div>
                              );
                            })}
                            {shelf.lots.length > 5 && (
                              <p className="text-xs text-gray-400">+{shelf.lots.length - 5} lô khác</p>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {warehouses.length === 0 && (
        <Card><CardContent className="py-12 text-center text-gray-400">
          Chưa có kho sáng nào
        </CardContent></Card>
      )}
    </div>
  );
}
