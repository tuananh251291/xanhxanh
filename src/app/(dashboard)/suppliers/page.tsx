import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import SupplierDialog from "./supplier-dialog";
import DeleteSupplierButton from "./delete-supplier-button";

export default async function SuppliersPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/suppliers"))) redirect("/dashboard");
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Truck className="w-6 h-6 text-secondary-foreground" /> Nhà cung cấp
          </h1>
          <p className="text-text-secondary text-sm mt-1">{suppliers.length} nhà cung cấp</p>
        </div>
        <SupplierDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã NCC</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên nhà cung cấp</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Trả hàng</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-text-muted">Chưa có nhà cung cấp nào</td></tr>
                ) : suppliers.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-info-foreground">{s.code}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{s.name}</td>
                    <td className="px-4 py-3">
                      {s.allowsReturn ? (
                        <Badge className="bg-success-light text-success-foreground">Được trả hàng · {s.returnWindowDays} ngày</Badge>
                      ) : (
                        <Badge variant="outline">Không được trả hàng</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <SupplierDialog item={{ id: s.id, code: s.code, name: s.name, isActive: s.isActive, allowsReturn: s.allowsReturn, returnWindowDays: s.returnWindowDays }} />
                        <DeleteSupplierButton id={s.id} code={s.code} name={s.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
