import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isGardenAdmin } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import { getGardenReceiptSender, GARDEN_RECEIPT_STATUS_LABELS } from "@/lib/garden-receipt";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PackageCheck, Plus } from "lucide-react";
import { format } from "date-fns";

type Status = keyof typeof GARDEN_RECEIPT_STATUS_LABELS;
const STATUS_ORDER: Status[] = ["PENDING", "COUNTING", "DISCREPANCY", "COMPLETED"];
const STATUS_BADGE: Record<Status, "info" | "in-progress" | "overdue" | "completed"> = {
  PENDING: "info", COUNTING: "in-progress", DISCREPANCY: "overdue", COMPLETED: "completed",
};

// Phiếu bàn giao cây mô về vườn — Quản lý vườn thấy phiếu gửi tới vườn mình quản lý, Kho TP/Kho mô thấy phiếu
// kho mình đã gửi, Admin thấy tất cả. Xem model GardenReceipt.
export default async function GardenReceiptsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !(await isPageAllowed(role, "/garden-receipts"))) redirect("/dashboard");

  const sender = await getGardenReceiptSender(session.user);
  let scope: Prisma.GardenReceiptWhereInput;
  if (isGardenAdmin(role)) scope = {};
  else if (role === "NHAN_VIEN_QUAN_LY_VUON") scope = { garden: { managerId: session.user.id } };
  else if (sender) scope = { fromWarehouseId: sender.warehouseId };
  else redirect("/dashboard");

  const { status: statusParam } = await searchParams;
  const status = STATUS_ORDER.includes(statusParam as Status) ? (statusParam as Status) : null;

  const [counts, receipts] = await Promise.all([
    prisma.gardenReceipt.groupBy({ by: ["status"], where: scope, _count: true }),
    prisma.gardenReceipt.findMany({
      where: { ...scope, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, code: true, status: true, createdAt: true, orderType: true, expectedDeliveryDate: true, saleUser: { select: { name: true } },
        garden: { select: { name: true } }, fromWarehouse: { select: { name: true } }, fromRoom: { select: { name: true } },
        createdBy: { select: { name: true } },
        items: { select: { quantity: true, receivedQuantity: true } },
      },
    }),
  ]);
  const countBy = new Map(counts.map((c) => [c.status, c._count]));
  const total = counts.reduce((s, c) => s + c._count, 0);
  const fmt = (n: number) => n.toLocaleString("vi-VN");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <PackageCheck className="w-6 h-6 text-primary-strong" /> Bàn giao cây mô về vườn
          </h1>
          <p className="text-text-secondary text-sm mt-1">Kho thành phẩm/Khu sản xuất lập phiếu → Quản lý vườn giao kiểm đếm, nhập số thực nhận → khớp thì cộng tồn vườn, lệch thì kiểm tra lại hoặc Admin cấp cao duyệt.</p>
        </div>
        {sender && (
          <Link href="/garden-receipts/new"><Button><Plus className="w-4 h-4 mr-1.5" /> Lập phiếu bàn giao</Button></Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/garden-receipts"><Button size="sm" variant={status ? "outline" : "default"}>Tất cả ({total})</Button></Link>
        {STATUS_ORDER.map((s) => (
          <Link key={s} href={`/garden-receipts?status=${s}`}>
            <Button size="sm" variant={status === s ? "default" : "outline"}>{GARDEN_RECEIPT_STATUS_LABELS[s]} ({countBy.get(s) ?? 0})</Button>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {receipts.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-10">Chưa có phiếu nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Mã phiếu</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Lệnh sản xuất</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Bên giao</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Vườn nhận</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Ngày lập</th>
                    <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Bàn giao</th>
                    <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Thực nhận</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => {
                    const sent = r.items.reduce((s, i) => s + i.quantity, 0);
                    const counted = r.items.every((i) => i.receivedQuantity !== null);
                    const received = r.items.reduce((s, i) => s + (i.receivedQuantity ?? 0), 0);
                    return (
                      <tr key={r.id} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                        <td className="px-4 py-2"><Link href={`/garden-receipts/${r.id}`} className="font-mono text-primary-strong underline underline-offset-2">{r.code}</Link></td>
                        <td className="px-4 py-2">
                          <Badge variant={r.orderType === "PLANNED" ? "info" : "in-progress"}>{r.orderType === "PLANNED" ? "Có kế hoạch" : "Cây nhiễm"}</Badge>
                          {r.orderType === "PLANNED" && (
                            <p className="text-xs text-text-secondary mt-0.5">{r.saleUser?.name}{r.expectedDeliveryDate ? ` · giao ${format(r.expectedDeliveryDate, "dd/MM")}` : ""}</p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-foreground">{r.fromWarehouse.name}{r.fromRoom ? ` · ${r.fromRoom.name}` : " · Phòng ra rễ"}</td>
                        <td className="px-4 py-2 text-foreground">{r.garden.name}</td>
                        <td className="px-4 py-2 text-text-secondary whitespace-nowrap">{format(r.createdAt, "dd/MM/yyyy HH:mm")} · {r.createdBy.name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(sent)}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${counted && received !== sent ? "text-destructive font-medium" : ""}`}>{counted ? fmt(received) : "—"}</td>
                        <td className="px-4 py-2"><Badge variant={STATUS_BADGE[r.status]}>{GARDEN_RECEIPT_STATUS_LABELS[r.status]}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
