import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import BasicPageHeader from "../basic-page-header";
import ExtraWorkRequestForm from "@/components/shared/extra-work-request-form";

export default async function DangKyCayThemPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CAY_MO") redirect("/dashboard-basic");

  const staff = await prisma.user.findUnique({ where: { id: session.user.id }, select: { inspectionLane: true } });

  return (
    <div className="min-h-screen bg-background">
      <BasicPageHeader title="Đăng ký làm thêm việc" />
      <div className="p-4 sm:p-6 max-w-xl mx-auto">
        <ExtraWorkRequestForm hideHeader inspectionLane={staff?.inspectionLane ?? null} />
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}
