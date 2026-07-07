import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Boxes } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import MaterialDialog from "./material-dialog";
import MaterialIntakeDialog from "./material-intake-dialog";

export default async function MaterialsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/materials"))) redirect("/dashboard");
  if (role !== "MOI_TRUONG" && role !== "SUPER_ADMIN" && role !== "ADMIN") redirect("/dashboard");

  const canCreate = role === "SUPER_ADMIN";
  const canIntake = role === "MOI_TRUONG";

  const materials = await prisma.material.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Boxes className="w-6 h-6 text-secondary-foreground" /> Quản lý vật tư
          </h1>
          <p className="text-text-secondary text-sm mt-1">{materials.length} vật tư</p>
        </div>
        {canCreate && <MaterialDialog />}
        {canIntake && <MaterialIntakeDialog materials={materials.map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit, quantity: m.quantity }))} />}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã vật tư</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên vật tư</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Đơn vị</th>
                  <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Tồn hiện tại</th>
                  {canCreate && <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {materials.length === 0 ? (
                  <tr><td colSpan={canCreate ? 5 : 4} className="px-4 py-12 text-center text-text-muted">Chưa có vật tư nào</td></tr>
                ) : materials.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-info-foreground">{m.code}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{m.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{m.unit ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                      {m.quantity <= 0 ? (
                        <Badge className="bg-danger-light text-destructive">Hết hàng</Badge>
                      ) : (
                        m.quantity.toLocaleString("vi-VN")
                      )}
                    </td>
                    {canCreate && (
                      <td className="px-4 py-3">
                        <MaterialDialog item={{ id: m.id, code: m.code, name: m.name, unit: m.unit ?? undefined, isActive: m.isActive }} />
                      </td>
                    )}
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
