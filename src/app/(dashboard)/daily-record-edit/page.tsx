import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/types";
import DailyRecordEditBoard from "./daily-record-edit-board";

// Admin/Admin cấp cao + KHO_MO (đúng kho sản xuất mình làm việc, xem canManageDailyRecords) — trước đây
// chỉ Admin, KHO_MO chỉ có đường sửa/bù nhật ký qua trang chi tiết chỉ định (/instructions/[id]); nay mở
// thêm điểm vào NÀY cho KHO_MO (gõ thẳng mã chỉ định thay vì phải tìm đúng chỉ định trong danh sách rồi
// bấm vào). Logic sửa dùng lại NGUYÊN VẸN EditDailyRecordDialog/AddDailyRecordDialog đã có (PATCH/POST
// /api/daily-records — canManageDailyRecords đã tự chặn KHO_MO thao tác chỉ định KHÁC kho mình, và chặn
// bù dữ liệu chỉ định không thuộc TUẦN HIỆN TẠI, xem daily-record-edit-board.tsx). Vi phạm nhập sai vẫn
// tính đúng cho NV cấy mô (DailyRecordEdit.staffId) bất kể ai sửa — xem PATCH /api/daily-records/[id].
export default async function DailyRecordEditPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KHO_MO") redirect("/dashboard");

  return <DailyRecordEditBoard isAdminUser={isAdminRole(role)} />;
}
