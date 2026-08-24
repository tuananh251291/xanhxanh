import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import TransferSendForm from "./transfer-send-form";

export default async function TransferSendPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Tính năng "Bàn giao mẫu mẹ" đã gỡ bỏ khỏi Kho mô — trang này chỉ còn dùng cho Kho thành phẩm
  // ("Trả hàng Kho Sản xuất" — vẫn là luân chuyển tự do giữa các phòng trong kho thành phẩm, chỉ đổi tên
  // hiển thị theo cách NV gọi tính năng này trong thực tế).
  if (role === "KHO_MO") redirect("/dashboard");
  if (!(await isPageAllowed(role, "/transfers/send"))) redirect("/dashboard");

  return <TransferSendForm role={role as UserRole} />;
}
