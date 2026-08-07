import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import InstructionQuantityEditBoard from "./instruction-quantity-edit-board";

// Chỉ Admin cấp cao (SUPER_ADMIN, KHÔNG gồm ADMIN thường) và Kho mô — 2 vai trò duy nhất được sửa lại
// số lượng dùng của chỉ định cấy sau khi đã tạo, mỗi vai trò có cửa sổ được sửa khác nhau (xem PATCH
// .../editQuantities ở api/instructions/[id]/route.ts): Admin cấp cao sửa được khi chỉ định còn đang
// thực hiện (status ACTIVE/DRAFT); Kho mô chỉ sửa được TRƯỚC khi NV cấy mô xác nhận nhận mẫu mẹ.
export default async function InstructionQuantityEditPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "SUPER_ADMIN" && role !== "KHO_MO") redirect("/dashboard");

  return <InstructionQuantityEditBoard role={role} />;
}
