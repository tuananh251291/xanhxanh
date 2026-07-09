import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import InspectForm from "./inspect-form";

export default async function InspectTransferPage({ params }: { params: Promise<{ transferId: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/transfers/receive-phong-toi"))) redirect("/dashboard");
  if (role !== "KHO_MO") redirect("/dashboard");

  const { transferId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-info-foreground" /> Kiểm tra bàn giao
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Ghi nhận số lượng nhiễm và tỉ lệ đạt kiểm tra ngẫu nhiên trước khi sắp xếp về kho
        </p>
      </div>
      <InspectForm transferId={transferId} />
    </div>
  );
}
