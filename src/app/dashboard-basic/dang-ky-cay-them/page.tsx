import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import BasicPageHeader from "../basic-page-header";
import ExtraWorkRequestForm from "@/components/shared/extra-work-request-form";

export default async function DangKyCayThemPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CAY_MO") redirect("/dashboard-basic");

  return (
    <div className="min-h-screen bg-background">
      <BasicPageHeader title="Đăng ký cấy thêm" />
      <div className="p-4 sm:p-6 max-w-xl mx-auto">
        <ExtraWorkRequestForm hideHeader />
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}
