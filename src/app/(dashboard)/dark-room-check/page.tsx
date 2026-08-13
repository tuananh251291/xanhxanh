import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Moon } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import DarkRoomCheckBoard from "./dark-room-check-board";

export default async function DarkRoomCheckPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/dark-room-check")) || role !== "KHO_MO") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Moon className="w-6 h-6 text-primary-strong" /> Kiểm tra kho tối
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          2 nhiệm vụ nhỏ — hoàn thành cả 2 mới tính xong việc &quot;Kiểm tra kho tối&quot; hôm nay.
        </p>
      </div>
      <DarkRoomCheckBoard />
    </div>
  );
}
