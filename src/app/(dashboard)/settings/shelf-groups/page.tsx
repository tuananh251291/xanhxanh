import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import ShelfGroupBoard from "./shelf-group-board";

export default async function ShelfGroupsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Chỉ Admin cấp cao (SUPER_ADMIN) mới cài đặt Nhóm giàn kệ — khác các trang khác vốn coi ADMIN và
  // SUPER_ADMIN ngang quyền (xem isAdminRole trong types/index.ts).
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  return <ShelfGroupBoard />;
}
