import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import PlaceStaffBoard from "./place-staff-board";

export default async function PlaceStaffPage({ params }: { params: Promise<{ staffId: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/transfers/receive-phong-toi"))) redirect("/dashboard");
  if (role !== "KHO_MO") redirect("/dashboard");

  const { staffId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-info-foreground" /> Sắp xếp vào kho
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Thông tin đầy đủ và mã kệ gợi ý — hệ thống tự chọn kệ
        </p>
      </div>
      <PlaceStaffBoard staffId={staffId} />
    </div>
  );
}
