import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardList, Printer, Search, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { format, startOfDay, endOfDay } from "date-fns";
import { vi } from "date-fns/locale";
import { INSTRUCTION_STATUS_LABELS, isAdminRole } from "@/types";
import CreateInstructionDialog from "./create-instruction-dialog";
import type { InstructionStatus } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import AssignStaffCell from "./assign-staff-cell";
import ConfirmHandoverButton from "./confirm-handover-button";

const STATUS_COLORS: Record<InstructionStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
  ENDED: "bg-slate-200 text-slate-700",
};

const PAGE_SIZE = 8;

export default async function InstructionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string; shelf?: string; plantCode?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/instructions"))) redirect("/dashboard");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const dateFilter = sp.date?.trim() ?? "";
  const shelfFilter = sp.shelf?.trim() ?? "";
  const plantCodeFilter = sp.plantCode?.trim() ?? "";

  const where: Record<string, unknown> = {};
  if (role === "CAY_MO") where.assignedToId = session!.user.id;
  // Kỹ thuật xem toàn bộ chỉ định cấy trong hệ thống, không chỉ chỉ định do mình tạo.
  // Kho mô chỉ cần theo dõi chỉ định "chưa bàn giao" và "đã bàn giao/chưa xác nhận" — chỉ định đã
  // hoàn thành (NV cấy mô đã xác nhận nhận mẫu mẹ) không cần hiện lại trong danh sách này nữa.
  if (role === "KHO_MO") where.motherReceivedAt = null;

  if (dateFilter) {
    const d = new Date(dateFilter);
    if (!Number.isNaN(d.getTime())) where.createdAt = { gte: startOfDay(d), lte: endOfDay(d) };
  }
  if (plantCodeFilter) {
    where.plantType = { code: { contains: plantCodeFilter, mode: "insensitive" } };
  }
  // Gộp bộ lọc kệ theo tên/mã (tìm kiếm) với ràng buộc địa điểm làm việc (NV kho mô chỉ làm việc 1 kho
  // sản xuất) vào cùng 1 điều kiện shelf, tránh 2 chỗ cùng ghi đè where.items.
  const shelfWhere: Record<string, unknown> = {};
  if (shelfFilter) {
    shelfWhere.OR = [
      { code: { contains: shelfFilter, mode: "insensitive" } },
      { name: { contains: shelfFilter, mode: "insensitive" } },
    ];
  }
  if (role === "KHO_MO" && session?.user?.workplaceWarehouseId) {
    shelfWhere.warehouseId = session.user.workplaceWarehouseId;
  }
  if (Object.keys(shelfWhere).length > 0) {
    where.items = { some: { shelf: shelfWhere } };
  }

  const [total, instructions, caymoStaff] = await Promise.all([
    prisma.plantingInstruction.count({ where }),
    prisma.plantingInstruction.findMany({
      where,
      include: {
        plantType: { select: { code: true, name: true } },
        createdBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    role === "KHO_MO"
      ? prisma.user.findMany({ where: { role: "CAY_MO", isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(dateFilter || shelfFilter || plantCodeFilter);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (dateFilter) params.set("date", dateFilter);
    if (shelfFilter) params.set("shelf", shelfFilter);
    if (plantCodeFilter) params.set("plantCode", plantCodeFilter);
    params.set("page", String(p));
    return `/instructions?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {role === "KHO_MO" ? "Chỉ định cấy chưa bàn giao" : "Chỉ định cấy"}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{total} chỉ định</p>
        </div>
        {(isAdminRole(role) || role === "KY_THUAT") && <CreateInstructionDialog />}
      </div>

      <Card>
        <CardContent className="pt-4">
          <form className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Ngày tạo</Label>
              <Input type="date" name="date" defaultValue={dateFilter} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Giàn kệ</Label>
              <Input type="text" name="shelf" defaultValue={shelfFilter} placeholder="VD: SXA-PS-R1C02" className="w-48" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mã cây</Label>
              <Input type="text" name="plantCode" defaultValue={plantCodeFilter} placeholder="VD: AL001" className="w-40" />
            </div>
            <Button type="submit" size="sm" className="bg-green-600 hover:bg-green-700">
              <Search className="w-4 h-4 mr-1" /> Tìm kiếm
            </Button>
            {hasFilters && (
              <Link href="/instructions">
                <Button type="button" variant="outline" size="sm">Xóa lọc</Button>
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {instructions.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Chưa có chỉ định cấy nào{hasFilters ? " khớp bộ lọc" : ""}</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-green-700">
                    <th className="text-left px-4 py-3 text-sm font-medium text-white">Mã chỉ định</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-white">Mã cây</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-white">Tên cây chi tiết</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-white">NV cấy</th>
                    {role === "KHO_MO" && <th className="text-left px-4 py-3 text-sm font-medium text-white">Bàn giao</th>}
                    <th className="text-left px-4 py-3 text-sm font-medium text-white">Trạng thái</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-white">Ngày tạo</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {instructions.map((inst) => (
                    <tr key={inst.id} className="border-b last:border-0 even:bg-green-50 hover:bg-green-100">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-blue-700">{inst.code}</td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-700">{inst.plantType.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{inst.plantType.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {!inst.assignedTo ? (
                          role === "KHO_MO" ? (
                            <AssignStaffCell instructionId={inst.id} staffList={caymoStaff} />
                          ) : (
                            <Badge variant="secondary">Chưa gán</Badge>
                          )
                        ) : (
                          inst.assignedTo.name
                        )}
                      </td>
                      {role === "KHO_MO" && (
                        <td className="px-4 py-3">
                          {inst.assignedTo && !inst.handedOverAt && <ConfirmHandoverButton instructionId={inst.id} />}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {role === "KHO_MO" ? (
                          !inst.handedOverAt ? (
                            <Badge className="bg-red-100 text-red-700">Chưa bàn giao</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700">Đã bàn giao / chưa xác nhận</Badge>
                          )
                        ) : (
                          <Badge className={STATUS_COLORS[inst.status as InstructionStatus]}>
                            {INSTRUCTION_STATUS_LABELS[inst.status as InstructionStatus]}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {format(inst.createdAt, "dd/MM/yyyy", { locale: vi })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Link href={`/instructions/${inst.id}`}>
                            <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700">
                              <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
                            </Button>
                          </Link>
                          <Link href={`/instructions/${inst.id}`} target="_blank">
                            <Button variant="ghost" size="sm" title="In phiếu chỉ định"><Printer className="w-4 h-4" /></Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-gray-500">Trang {page}/{totalPages}</p>
                <div className="flex gap-2">
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)}>
                      <Button variant="outline" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Trước</Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled><ChevronLeft className="w-4 h-4 mr-1" /> Trước</Button>
                  )}
                  {page < totalPages ? (
                    <Link href={pageHref(page + 1)}>
                      <Button variant="outline" size="sm">Sau <ChevronRight className="w-4 h-4 ml-1" /></Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled>Sau <ChevronRight className="w-4 h-4 ml-1" /></Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
