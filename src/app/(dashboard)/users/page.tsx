import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ROLE_LABELS, ROLE_COLORS } from "@/types";
import type { UserRole, Prisma } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import CreateUserDialog from "./create-user-dialog";
import EditUserDialog from "./edit-user-dialog";
import PendingApprovals from "./pending-approvals";
import PermissionMatrix from "./permission-matrix";
import WorkplaceCell from "./workplace-cell";

const WORKPLACE_ROLES = ["KHO_MO", "CAY_MO", "MOI_TRUONG"] as const;
const PAGE_SIZE = 7;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/users"))) redirect("/dashboard");
  const canApprove = session?.user?.role === "SUPER_ADMIN";

  const sp = await searchParams;
  const search = sp.q?.trim() ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.UserWhereInput = search
    ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }] }
    : {};

  const [totalAllUsers, pendingUsers, filteredTotal, users, permissions, sanXuatWarehouses] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      where: { status: "PENDING" },
      select: { id: true, code: true, name: true, email: true },
    }),
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: { workplaceWarehouse: { select: { code: true, name: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.rolePermission.findMany(),
    prisma.warehouse.findMany({ where: { type: "SAN_XUAT", isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("page", String(p));
    return `/users?${qs.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý người dùng</h1>
          <p className="text-text-secondary text-sm mt-1">{totalAllUsers} tài khoản</p>
        </div>
        <CreateUserDialog />
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Tài khoản</TabsTrigger>
          <TabsTrigger value="permissions">Phân quyền</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4 mt-4">
          {canApprove && (
            <PendingApprovals
              users={pendingUsers.map((u) => ({ id: u.id, code: u.code, name: u.name, email: u.email }))}
            />
          )}
          {!canApprove && pendingUsers.length > 0 && (
            <Card className="border-l-4 border-l-yellow-500">
              <CardContent className="py-3 text-sm text-text-secondary">
                Có {pendingUsers.length} tài khoản đang chờ duyệt — chỉ Admin cao nhất mới có quyền duyệt.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-4">
              <form className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tên hoặc mã nhân viên</Label>
                  <Input type="text" name="q" defaultValue={search} placeholder="VD: NVCM001 hoặc Trần Thị Cấy" className="w-64" />
                </div>
                <Button type="submit" size="sm" className="bg-primary hover:bg-primary-hover">
                  <Search className="w-4 h-4 mr-1" /> Tìm kiếm
                </Button>
                {search && (
                  <Link href="/users">
                    <Button type="button" variant="outline" size="sm">Xóa lọc</Button>
                  </Link>
                )}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã NV</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Email</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Vai trò</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Vị trí làm việc</th>
                      {canApprove && <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono text-text-secondary">{user.code}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{user.name}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{user.email}</td>
                        <td className="px-4 py-3">
                          {user.role ? (
                            <Badge className={ROLE_COLORS[user.role as UserRole]}>
                              {ROLE_LABELS[user.role as UserRole]}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Chưa gán</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {user.role && WORKPLACE_ROLES.includes(user.role as (typeof WORKPLACE_ROLES)[number]) ? (
                            canApprove ? (
                              <WorkplaceCell userId={user.id} currentWarehouseId={user.workplaceWarehouseId} warehouseOptions={sanXuatWarehouses} />
                            ) : (
                              <span className="text-xs text-text-secondary">
                                {user.workplaceWarehouse ? `${user.workplaceWarehouse.name} (${user.workplaceWarehouse.code})` : "Chưa gán"}
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-text-muted">—</span>
                          )}
                        </td>
                        {canApprove && (
                          <td className="px-4 py-3">
                            {user.role && user.role !== "SUPER_ADMIN" ? (
                              <EditUserDialog
                                user={{ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive }}
                              />
                            ) : (
                              <span className="text-xs text-text-muted">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={canApprove ? 6 : 5} className="px-4 py-8 text-center text-sm text-text-muted">
                          Không tìm thấy nhân viên phù hợp
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
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
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <PermissionMatrix permissions={permissions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
