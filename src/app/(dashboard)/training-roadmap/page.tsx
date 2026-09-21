import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { GraduationCap, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isPageAllowed } from "@/lib/permissions";
import { TRAINING_ROADMAP_WEEKS, getTrainingWeekRange, getCurrentTrainingWeek } from "@/lib/training-roadmap";

export default async function TrainingRoadmapPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Chỉ NV cấy mô ĐANG thử việc mới xem được — chính khớp điều kiện hiện mục này ở sidebar (xem
  // src/app/(dashboard)/layout.tsx), chặn cả người gõ thẳng URL.
  if (role !== "CAY_MO") redirect("/dashboard");
  if (!(await isPageAllowed(role, "/training-roadmap"))) redirect("/dashboard");

  const user = await prisma.user.findUnique({
    where: { id: session!.user!.id },
    select: { probationStartDate: true, employmentType: true },
  });
  if (user?.employmentType !== "THU_VIEC") redirect("/dashboard");

  const probationStartDate = user.probationStartDate;
  const currentWeek = probationStartDate
    ? getCurrentTrainingWeek(probationStartDate, TRAINING_ROADMAP_WEEKS.length)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-primary-strong" />
          Lộ trình đào tạo thử việc
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          9 tuần thử việc, mỗi tuần 7 ngày, tính từ ngày bắt đầu thử việc.
        </p>
      </div>

      {!probationStartDate && (
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-warning-foreground bg-warning-light rounded-lg px-3 py-2">
              Chưa có ngày bắt đầu thử việc — liên hệ Hành chính nhân sự để cập nhật.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold w-48">Thời gian</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold w-64">Mục tiêu</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Yêu cầu cần đạt</th>
                </tr>
              </thead>
              <tbody>
                {TRAINING_ROADMAP_WEEKS.map((w) => {
                  const isCurrent = currentWeek === w.week;
                  const range = probationStartDate ? getTrainingWeekRange(probationStartDate, w.week) : null;
                  return (
                    <tr
                      key={w.week}
                      className={isCurrent ? "bg-primary-light/60 border-b last:border-0" : "border-b last:border-0 even:bg-primary-light/30"}
                    >
                      <td className="px-4 py-3 align-top">
                        <p className="font-bold text-foreground">Tuần {w.week}</p>
                        {range ? (
                          <p className="text-xs text-text-secondary mt-0.5">
                            {format(range.start, "dd/MM/yyyy", { locale: vi })} – {format(range.end, "dd/MM/yyyy", { locale: vi })}
                          </p>
                        ) : (
                          <p className="text-xs text-text-muted mt-0.5">Chưa xác định</p>
                        )}
                        {isCurrent && <Badge variant="in-progress" className="mt-1.5">Đang thực hiện</Badge>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-bold text-primary-strong">{w.goalTitle}</p>
                        {w.goalLines.map((line, i) => (
                          <p key={i} className="text-text-secondary text-xs mt-1">{line}</p>
                        ))}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <ul className="space-y-1.5">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg bg-info-light text-info-foreground text-sm p-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Lưu ý: 2 tuần liên tiếp đạt tốc độ cấy và tỷ lệ nhiễm (≤ 5%) → đạt yêu cầu tuyển dụng → ký hợp đồng lao động và nhận lương chính thức.
        </p>
      </div>
    </div>
  );
}
