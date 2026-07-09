import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import PlaceBoard from "./place-board";

export default async function PlaceTransferPage({ params }: { params: Promise<{ transferId: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/transfers/receive-phong-toi"))) redirect("/dashboard");
  if (role !== "KHO_MO") redirect("/dashboard");

  const { transferId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-info-foreground" /> Sắp xếp về kho
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Xác nhận xếp kệ cho lô đã kiểm tra — hệ thống tự chọn kệ, giống luồng Xanh
        </p>
      </div>
      <PlaceBoard transferId={transferId} />
    </div>
  );
}
