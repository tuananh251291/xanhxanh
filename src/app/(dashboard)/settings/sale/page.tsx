import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SaleSettingsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Chỉ Admin cấp cao (SUPER_ADMIN) — giống tiền lệ settings/shelf-groups, settings/data-import.
  if (role !== "SUPER_ADMIN") redirect("/dashboard");
  redirect("/settings/sale/customers");
}
