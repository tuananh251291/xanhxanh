import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Send } from "lucide-react";
import RndHandoverBoard from "./rnd-handover-board";

// Trang riêng "Bàn giao" của Admin kỹ thuật — gửi sản phẩm R&D (mẫu mẹ hoặc thành phẩm, đang nằm trong
// Phòng tối cá nhân R&D, đã kiểm tra nhiễm) sang 1 kho THẬT khác trong hệ thống (khu sản xuất hoặc kho
// thành phẩm), xem POST /api/rnd-warehouse-handover/send.
export default async function RndHandoverPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Send className="w-6 h-6 text-primary-strong" /> Bàn giao
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Bàn giao sản phẩm R&D sang 1 khu sản xuất hoặc kho thành phẩm khác đang có trong hệ thống.
        </p>
      </div>

      <RndHandoverBoard />
    </div>
  );
}
