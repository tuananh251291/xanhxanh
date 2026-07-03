import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserPlus } from "lucide-react";
import { ROLE_LABELS, ROLE_COLORS } from "@/types";
import type { UserRole } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import CreateUserDialog from "./create-user-dialog";
import PendingApprovals from "./pending-approvals";
import PermissionMatrix from "./permission-matrix";

export default async function UsersPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/users"))) redirect("/dashboard");
  const canApprove = session?.user?.role === "SUPER_ADMIN";

  const [users, permissions] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.rolePermission.findMany(),
  ]);

  const pendingUsers = users.filter((u) => u.status === "PENDING");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý người dùng</h1>
          <p className="text-gray-500 text-sm mt-1">{users.length} tài khoản</p>
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
              <CardContent className="py-3 text-sm text-gray-600">
                Có {pendingUsers.length} tài khoản đang chờ duyệt — chỉ Admin cao nhất mới có quyền duyệt.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Tên</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Email</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Vai trò</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Trạng thái</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
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
                          <Badge variant={user.isActive ? "default" : "secondary"} className={user.isActive ? "bg-green-100 text-green-700" : ""}>
                            {user.isActive ? "Hoạt động" : "Vô hiệu"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="sm">Sửa</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <PermissionMatrix permissions={permissions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
