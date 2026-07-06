import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Moon, ArrowLeft, Search, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { isPageAllowed } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 20;
const COL_SIZE = 10;

type ShelfRow = {
  id: string;
  assignedStaff: { code: string; name: string } | null;
};

export default async function PhongToiRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/phong-toi"))) redirect("/dashboard");

  const { roomId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const search = sp.q?.trim() ?? "";

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, name: true, type: true, warehouse: { select: { name: true, code: true } } },
  });
  if (!room || room.type !== "PHONG_TOI") notFound();

  const where: Prisma.ShelfWhereInput = { roomId, isActive: true };
  if (search) {
    where.assignedStaff = {
      OR: [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const [totalAll, total, shelves] = await Promise.all([
    prisma.shelf.count({ where: { roomId, isActive: true } }),
    prisma.shelf.count({ where }),
    prisma.shelf.findMany({
      where,
      include: { assignedStaff: { select: { code: true, name: true } } },
      orderBy: { assignedStaff: { name: "asc" } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const col1 = shelves.slice(0, COL_SIZE);
  const col2 = shelves.slice(COL_SIZE, PAGE_SIZE);

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("page", String(p));
    return `/inventory/phong-toi/${room.id}?${qs.toString()}`;
  };

  const renderTable = (rows: ShelfRow[]) => (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-green-700">
                <th className="text-left px-4 py-3 font-medium text-white">Mã NV</th>
                <th className="text-left px-4 py-3 font-medium text-white">Tên NV</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((shelf) => (
                <tr key={shelf.id} className="border-b last:border-0 even:bg-green-50 hover:bg-green-100">
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{shelf.assignedStaff?.code ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{shelf.assignedStaff?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/inventory/phong-toi/${room.id}/${shelf.id}`}>
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
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/inventory/phong-toi">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Moon className="w-6 h-6 text-indigo-600" /> {room.name}
          </h1>
          <p className="text-gray-500 text-sm">
            {room.warehouse.name} ({room.warehouse.code}) · {totalAll} nhân viên đang có phòng tối riêng
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <form className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Mã hoặc tên nhân viên</Label>
              <Input type="text" name="q" defaultValue={search} placeholder="VD: NV003 hoặc Trần Thị Cấy" className="w-64" />
            </div>
            <Button type="submit" size="sm" className="bg-green-600 hover:bg-green-700">
              <Search className="w-4 h-4 mr-1" /> Tìm kiếm
            </Button>
            {search && (
              <Link href={`/inventory/phong-toi/${room.id}`}>
                <Button type="button" variant="outline" size="sm">Xóa lọc</Button>
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {shelves.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <Moon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>{search ? "Không tìm thấy nhân viên phù hợp" : "Chưa có nhân viên nào có phòng tối tại đây"}</p>
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderTable(col1)}
            {col2.length > 0 && renderTable(col2)}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
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
        </>
      )}
    </div>
  );
}
