import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessOrchidAdmin, canManageOrchidAdminOnly, type UserRole } from "@/types";

// Chặn trang quản trị Dự án hoa lan — adminOnly = chỉ Admin cấp cao (Chi phí/Báo cáo/Cấu hình).
export async function requireOrchidStaffPage(adminOnly = false) {
  const session = await auth();
  const role = (session?.user?.role ?? null) as UserRole | null;
  if (!session?.user || !canAccessOrchidAdmin(role)) redirect("/dashboard");
  if (adminOnly && !canManageOrchidAdminOnly(role)) redirect("/orchid");
  return { id: session.user.id, name: session.user.name ?? "", role: role!, isSuperAdmin: role === "SUPER_ADMIN" };
}

export async function requireOrchidCustomerPage() {
  const session = await auth();
  if (session?.user?.role !== "KHACH_HANG_LAN") redirect("/dashboard");
  const customer = await prisma.orchidCustomer.findUnique({ where: { userId: session.user.id } });
  return { user: session.user, customer };
}

export async function requireOrchidPointPage() {
  const session = await auth();
  if (session?.user?.role !== "DIEM_BAN_LAN") redirect("/dashboard");
  const point = await prisma.orchidRetailPoint.findUnique({ where: { userId: session.user.id } });
  return { user: session.user, point };
}

// Kho mặc định + loại chi mặc định theo khung nghiệp vụ — tạo 1 lần nếu chưa có (idempotent).
const DEFAULT_EXPENSE_CATEGORIES: { group: "MUA_HANG" | "VAN_HANH" | "BAN_HANG" | "KHAC"; names: string[] }[] = [
  { group: "MUA_HANG", names: ["Tiền mua cây", "Tiền vận chuyển", "Phí nhập khẩu", "Thuế", "Phí kiểm dịch", "Mua vật tư khác"] },
  { group: "VAN_HANH", names: ["Lương", "Thuê nhà/kho", "Xăng xe"] },
  { group: "BAN_HANG", names: ["Phí sale", "Phí vận chuyển"] },
  { group: "KHAC", names: ["Chi khác"] },
];

export async function ensureOrchidDefaults() {
  const [warehouseCount, categoryCount, accountCount] = await Promise.all([
    prisma.orchidWarehouse.count(),
    prisma.orchidExpenseCategory.count(),
    prisma.orchidPaymentAccount.count(),
  ]);
  if (warehouseCount === 0) {
    await prisma.orchidWarehouse.create({ data: { code: "KTT", name: "Kho trung tâm" } }).catch(() => {});
  }
  if (categoryCount === 0) {
    await prisma.orchidExpenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.flatMap((g) => g.names.map((name, i) => ({ group: g.group, name, sortOrder: i }))),
      skipDuplicates: true,
    });
  }
  if (accountCount === 0) {
    await prisma.orchidPaymentAccount.create({ data: { name: "Quỹ tiền mặt", type: "CASH" } }).catch(() => {});
  }
}
