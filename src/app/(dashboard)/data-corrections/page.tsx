import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import DataCorrectionsBoard from "./data-corrections-board";

export default async function DataCorrectionsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/data-corrections")) || !(isAdminRole(role) || role === "KHO_MO")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-destructive" /> Theo dõi nhập sai dữ liệu cấy
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Số lần Admin/Kho mô đã phải sửa lại nhật ký cấy của từng NV cấy mô trong tuần này — chỉ tính
          những lần thực sự đổi số liệu.
        </p>
      </div>
      <DataCorrectionsBoard />
    </div>
  );
}
