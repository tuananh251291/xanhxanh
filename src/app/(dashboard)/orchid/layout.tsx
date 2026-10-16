import { requireOrchidStaffPage, ensureOrchidDefaults } from "@/lib/orchid/page-guard";
import OrchidSubNav from "./sub-nav";

// Khu quản trị Dự án hoa lan (Admin hoa lan + Trợ lý hoa lan) — 1 mục menu dọc "Dự án hoa lan", các phần con
// hiện ở thanh điều hướng ngang này.
export default async function OrchidLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOrchidStaffPage();
  await ensureOrchidDefaults();
  return (
    <div className="space-y-5">
      <OrchidSubNav isOrchidAdmin={user.isOrchidAdmin} />
      {children}
    </div>
  );
}
