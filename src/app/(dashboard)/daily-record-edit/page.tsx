import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/types";
import DailyRecordEditBoard from "./daily-record-edit-board";

// Chỉ Admin/Admin cấp cao — KHO_MO đã có đường sửa/bù nhật ký riêng qua trang chi tiết chỉ định
// (/instructions/[id], xem canManageDailyRecords) nên không cần thêm ở đây. Trang này chỉ khác về
// ĐIỂM VÀO (gõ thẳng mã chỉ định thay vì phải tìm đúng chỉ định trong danh sách rồi bấm vào) — logic sửa
// bên dưới dùng lại NGUYÊN VẸN EditDailyRecordDialog/AddDailyRecordDialog đã có (PATCH/POST
// /api/daily-records, đã xử lý đủ các ràng buộc an toàn: khoá khi lô đã bị động tới nơi khác, giới hạn
// bù dữ liệu chỉ trong tuần hiện tại...).
export default async function DailyRecordEditPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role)) redirect("/dashboard");

  return <DailyRecordEditBoard />;
}
