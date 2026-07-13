import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DataImportBoard from "./data-import-board";

export default async function DataImportPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Chỉ Admin cấp cao (SUPER_ADMIN) mới được nhập liệu trực tiếp hàng loạt — khác các trang khác vốn
  // coi ADMIN và SUPER_ADMIN ngang quyền (xem isAdminRole trong types/index.ts), giống hệt tiền lệ
  // settings/shelf-groups.
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  return <DataImportBoard />;
}
