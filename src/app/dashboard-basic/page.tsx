import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { Leaf, LayoutDashboard } from "lucide-react";
import { getCayMoQuestStats } from "@/lib/cay-mo-quest-stats";
import { randomGreetingQuote } from "@/lib/greetings";
import { ensureInstructionsEnded } from "@/lib/instruction-lifecycle";
import CayMoQuestDashboard from "./quest-dashboard";
import LogoutFab from "./logout-fab";

export default async function DashboardBasicPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await ensureInstructionsEnded();
  const today = format(new Date(), "EEEE, dd/MM/yyyy", { locale: vi });
  const role = session.user.role;
  const userName = session.user.name ?? "";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-divider bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground p-2 rounded-lg">
            <Leaf className="w-5 h-5" />
          </div>
          <span className="font-bold text-foreground">Xanh Xanh</span>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline"
        >
          <LayoutDashboard className="w-4 h-4" />
          Giao diện nâng cao
        </Link>
      </header>

      <div className="p-4 sm:p-6 pb-24">
        {role === "CAY_MO" ? (
          <CayMoQuestDashboard
            stats={await getCayMoQuestStats(session.user.id)}
            userName={userName}
            userId={session.user.id}
            quote={randomGreetingQuote()}
            today={today}
          />
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
              <p className="text-text-secondary text-sm mt-1 capitalize">{today}</p>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Giao diện cơ bản</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-secondary">
                  Trang này đang được xây dựng, nội dung rút gọn sẽ được bổ sung sau.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <LogoutFab />
      <Toaster richColors position="top-right" />
    </div>
  );
}
