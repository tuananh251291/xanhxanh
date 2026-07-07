import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Moon, ArrowLeft, Search, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { isPageAllowed } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 5;

export default async function PhongToiWarehousePage({
  params,
  searchParams,
}: {
  params: Promise<{ warehouseId: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/phong-toi"))) redirect("/dashboard");

  const { warehouseId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const search = sp.q?.trim() ?? "";

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, name: true, code: true, type: true },
  });
  if (!warehouse || warehouse.type !== "SAN_XUAT") notFound();

  const where: Prisma.RoomWhereInput = { warehouseId, type: "PHONG_TOI", isActive: true };
  if (search) {
    where.assignedStaff = {
      OR: [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const [totalAll, total, rooms, contaminationRoom] = await Promise.all([
    prisma.room.count({ where: { warehouseId, type: "PHONG_TOI", isActive: true } }),
    prisma.room.count({ where }),
    prisma.room.findMany({
      where,
      include: { assignedStaff: { select: { code: true, name: true } } },
      orderBy: { assignedStaff: { name: "asc" } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.room.findFirst({ where: { warehouseId, type: "PHONG_NHIEM" }, select: { id: true, code: true, name: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("page", String(p));
    return `/inventory/phong-toi/${warehouse.id}?${qs.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/inventory/phong-toi">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Moon className="w-6 h-6 text-primary-strong" /> Phòng tối — {warehouse.name}
          </h1>
          <p className="text-text-secondary text-sm">
            {warehouse.name} ({warehouse.code}) · {totalAll} nhân viên đang có phòng tối riêng
          </p>
        </div>
      </div>

      {contaminationRoom && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <span className="text-base font-bold text-primary-strong">Phòng nhiễm</span>
            <Link href={`/inventory/phong-toi/${warehouse.id}/${contaminationRoom.id}`}>
              <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
                <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-2">
          <form className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[0.8rem]">Tìm kiếm theo mã hoặc tên nhân viên</Label>
              <Input type="text" name="q" defaultValue={search} placeholder="VD: NV003 hoặc Trần Thị Cấy" className="w-64" />
            </div>
            <Button type="submit" size="sm" className="bg-primary hover:bg-primary-hover">
              <Search className="w-4 h-4 mr-1" /> Tìm kiếm
            </Button>
            {search && (
              <Link href={`/inventory/phong-toi/${warehouse.id}`}>
                <Button type="button" variant="outline" size="sm">Xóa lọc</Button>
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {rooms.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <Moon className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>{search ? "Không tìm thấy nhân viên phù hợp" : "Chưa có nhân viên nào có phòng tối tại đây"}</p>
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base font-bold text-primary-strong">Phòng tối cá nhân</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã NV</th>
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên NV</th>
                      <th className="px-4 py-3 font-bold text-base"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room) => (
                      <tr key={room.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                        <td className="px-4 py-3 text-text-secondary font-mono text-xs">{room.assignedStaff?.code ?? "—"}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{room.assignedStaff?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/inventory/phong-toi/${warehouse.id}/${room.id}`}>
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-text-secondary">Trang {page}/{totalPages}</p>
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
        </>
      )}
    </div>
  );
}
