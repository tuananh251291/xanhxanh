import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Leaf } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import MotherContaminationReport from "../mother-contamination-report";
import DarkRoomContaminationByInstructionSection from "../overview/dark-room-contamination-by-instruction-section";

// Trang báo cáo tỉ lệ nhiễm riêng cho NV kho mô — gom các report NV kỹ thuật đã có sẵn ở /reports/overview
// nhưng liên quan trực tiếp tới phạm vi theo dõi của Kho mô, tách riêng 1 trang gọn thay vì nhúng cả
// trang "Thống kê trực quan" (các mục khác như xếp hạng NV cấy mô/tiến độ chỉ định không thuộc phạm vi
// Kho mô). Thêm report nào liên quan tới Kho mô thì thêm tiếp vào đây.
export default async function MotherContaminationPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/reports/mother-contamination"))) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Leaf className="w-6 h-6 text-primary-strong" /> Báo cáo tỉ lệ nhiễm
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Nhiễm mẫu mẹ đầu vào lúc kiểm tra hàng ngày và nhiễm sau ủ tối, tính theo từng chỉ định cấy
        </p>
      </div>
      <MotherContaminationReport />
      <DarkRoomContaminationByInstructionSection />
    </div>
  );
}
