import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PendingStatusScreen from "@/app/(dashboard)/pending-status-screen";

// Trước đây dashboard-basic KHÔNG có layout riêng — mỗi trang tự auth() + chỉ chặn "chưa đăng nhập",
// không chặn tài khoản chưa duyệt/bị từ chối/phiên đã bị thay thế (session-revoked) như (dashboard)/layout.tsx
// đã làm — nghĩa là 1 NV bị đăng xuất ở Giao diện nâng cao (vì đăng nhập ở thiết bị khác) vẫn lách qua
// được bằng cách chuyển sang Giao diện cơ bản, làm mất tác dụng của giới hạn "chỉ 1 phiên/tài khoản".
// Thêm layout này để áp đúng 1 chỗ, khớp hành vi với (dashboard)/layout.tsx.
export default async function DashboardBasicLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.status !== "APPROVED" || session.user.sessionRevoked) {
    return <PendingStatusScreen status={session.user.status} sessionRevoked={session.user.sessionRevoked} />;
  }

  return <>{children}</>;
}
