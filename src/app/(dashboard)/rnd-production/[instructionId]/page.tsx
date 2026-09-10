import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import RecordOutputForm from "./record-output-form";

export default async function RndRecordOutputPage({ params }: { params: Promise<{ instructionId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") redirect("/dashboard");

  const { instructionId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary-strong" /> Nhập kết quả trả ra
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Nhập tổng kết quả 1 lần cho cả kì cấy — dùng hết mẫu mẹ sẽ tự kết thúc kì này và tạo sẵn kì tiếp theo.
        </p>
      </div>

      <RecordOutputForm instructionId={instructionId} />
    </div>
  );
}
