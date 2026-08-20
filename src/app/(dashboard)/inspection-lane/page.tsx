import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import InspectionLaneBoard from "./inspection-lane-board";

export default async function InspectionLanePage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inspection-lane"))) redirect("/dashboard");
  // Chỉ NV kho mô mới có nghiệp vụ này — cài đặt luồng kiểm tra cho đúng NV cấy mô cùng kho sản xuất
  // mình đang làm việc.
  if (role !== "KHO_MO") redirect("/dashboard");

  return <InspectionLaneBoard workplaceWarehouseId={session?.user?.workplaceWarehouseId ?? null} />;
}
