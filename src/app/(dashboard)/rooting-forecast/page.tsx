import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sprout } from "lucide-react";
import RootingForecastBoard from "./rooting-forecast-board";

export default async function RootingForecastPage() {
  const session = await auth();
  if (session?.user?.role !== "KY_THUAT") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sprout className="w-6 h-6 text-primary-strong" /> Dự kiến đáp ứng cây ra rễ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Điền số cây ra rễ dự kiến đáp ứng được tháng tới cho từng mã cây đang hoạt động tại cơ sở sản
          xuất của bạn — hạn hoàn thành ngày 15 hàng tháng (dời sang 16 nếu 15 rơi vào Chủ nhật).
        </p>
      </div>
      <RootingForecastBoard />
    </div>
  );
}
