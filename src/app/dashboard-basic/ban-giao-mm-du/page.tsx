import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { Card, CardContent } from "@/components/ui/card";
import { PackageMinus } from "lucide-react";
import BasicPageHeader from "../basic-page-header";
import { getSurplusHandoverCandidates } from "@/lib/surplus-handover";
import SurplusHandoverButton from "@/app/(dashboard)/my-instructions/surplus-handover-button";

export default async function BanGiaoMMDuPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CAY_MO") redirect("/dashboard-basic");

  const candidates = await getSurplusHandoverCandidates(session.user.id);

  return (
    <div className="min-h-screen bg-background">
      <BasicPageHeader title="Bàn giao MM dư" />
      <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-4">
        <p className="text-sm text-text-secondary">
          Mẫu mẹ còn dư từ chỉ định đã kết thúc (hết tuần hoặc bạn tự kết thúc sớm) — bàn giao lại cho Kho mô.
        </p>

        {candidates.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-text-muted">
              <PackageMinus className="w-10 h-10 mx-auto mb-3 text-text-muted" />
              <p>Không có mẫu mẹ dư cần bàn giao</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {candidates.map((c) => (
              <Card key={c.id}>
                <CardContent className="py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-mono font-bold text-info-foreground truncate">{c.code}</p>
                    <p className="text-xs text-text-secondary">Còn dư {c.surplus.toLocaleString("vi-VN")} cụm mẫu mẹ</p>
                  </div>
                  <SurplusHandoverButton instructionId={c.id} surplus={c.surplus} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}
