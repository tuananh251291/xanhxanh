import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Tags } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import PlantingErrorTypesBoard from "./planting-error-types-board";

export default async function PlantingErrorTypesPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/planting-error-types")) || !(role === "KY_THUAT" || isAdminRole(role))) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Tags className="w-6 h-6 text-primary-strong" /> Phân loại lỗi cấy
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Danh sách loại lỗi cấy dùng chung cho mọi NV Kỹ thuật — thêm được loại mới, không xoá được sau khi đã thêm.
        </p>
      </div>
      <PlantingErrorTypesBoard />
    </div>
  );
}
