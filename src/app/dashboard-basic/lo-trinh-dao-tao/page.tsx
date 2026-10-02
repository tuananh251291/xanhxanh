import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import BasicPageHeader from "../basic-page-header";
import { TRAINING_ROADMAP_WEEKS, getTrainingWeekRange, getCurrentTrainingWeek } from "@/lib/training-roadmap";

// Lộ trình đào tạo thử việc ở Giao diện cơ bản — cùng nội dung với /training-roadmap (Giao diện nâng cao)
// nhưng hiển thị dạng thẻ từng tuần thay cho bảng 3 cột, dễ đọc trên điện thoại. Cùng điều kiện truy cập:
// chỉ NV cấy mô đang thử việc (employmentType = THU_VIEC).
export default async function LoTrinhDaoTaoPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CAY_MO") redirect("/dashboard-basic");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { probationStartDate: true, employmentType: true },
  });
  if (user?.employmentType !== "THU_VIEC") redirect("/dashboard-basic");

  const probationStartDate = user.probationStartDate;
  const currentWeek = probationStartDate
    ? getCurrentTrainingWeek(probationStartDate, TRAINING_ROADMAP_WEEKS.length)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <BasicPageHeader title="Lộ trình đào tạo thử việc" />
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
        <p className="text-sm text-text-secondary">9 tuần thử việc, mỗi tuần 7 ngày, tính từ ngày bắt đầu thử việc.</p>

        {!probationStartDate && (
          <p className="text-sm text-warning-foreground bg-warning-light rounded-lg px-3 py-2">
            Chưa có ngày bắt đầu thử việc — liên hệ Hành chính nhân sự để cập nhật.
          </p>
        )}

        {TRAINING_ROADMAP_WEEKS.map((w) => {
          const isCurrent = currentWeek === w.week;
          const isPast = currentWeek != null && w.week < currentWeek;
          const range = probationStartDate ? getTrainingWeekRange(probationStartDate, w.week) : null;
          return (
            <Card key={w.week} className={isCurrent ? "border-2 border-primary" : isPast ? "opacity-70" : undefined}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-foreground">Tuần {w.week}</p>
                    <p className="text-xs text-text-secondary">
                      {range
                        ? `${format(range.start, "dd/MM/yyyy", { locale: vi })} – ${format(range.end, "dd/MM/yyyy", { locale: vi })}`
                        : "Chưa xác định"}
                    </p>
                  </div>
                  {isCurrent && <Badge variant="in-progress">Đang thực hiện</Badge>}
                  {isPast && <Badge variant="secondary">Đã qua</Badge>}
                </div>

                <div className="rounded-xl bg-primary-light/50 px-3 py-2">
                  <p className="text-sm font-bold text-primary-strong">Mục tiêu: {w.goalTitle}</p>
                  {w.goalLines.map((line, i) => (
                    <p key={i} className="text-xs text-text-secondary mt-1">{line}</p>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-semibold text-text-secondary mb-1.5">Yêu cầu cần đạt</p>
                  <ul className="space-y-1.5 text-sm">
                    {w.requirements.map((req, i) => (
                      <li key={i} className="text-foreground">
                        {typeof req === "string" ? (
                          <span>✓ {req}</span>
                        ) : (
                          <>
                            <span>✓ {req.text}</span>
                            <ul className="ml-5 mt-1 space-y-1 list-disc text-text-secondary text-xs">
                              {req.subItems.map((s, j) => (
                                <li key={j}>{s}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          );
        })}

        <div className="flex items-start gap-2 rounded-lg bg-info-light text-info-foreground text-sm p-3">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Lưu ý: 2 tuần liên tiếp đạt tốc độ cấy và tỷ lệ nhiễm (≤ 5%) → đạt yêu cầu tuyển dụng → ký hợp đồng lao động và nhận lương chính thức.
          </p>
        </div>
      </div>
    </div>
  );
}
