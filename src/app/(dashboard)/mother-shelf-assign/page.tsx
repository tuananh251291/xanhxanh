import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import MotherShelfAssignBoard from "./mother-shelf-assign-board";

export default async function MotherShelfAssignPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/mother-shelf-assign")) || role !== "KHO_MO") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-primary-strong" /> Gán mã cây & nhân viên cho giàn mẫu mẹ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Chọn mã cây phụ trách và nhân viên cấy mô cho từng giàn kệ trong Phòng mẫu mẹ của kho mình.
        </p>
      </div>
      <MotherShelfAssignBoard />
    </div>
  );
}
