import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import BasicPageHeader from "../basic-page-header";
import DailyRecordSimpleForm from "./daily-record-simple-form";

export default async function CapNhatSoLieuPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CAY_MO") redirect("/dashboard-basic");

  return (
    <div className="min-h-screen bg-background">
      <BasicPageHeader title="Cập nhật số liệu cấy" />
      <div className="p-4 sm:p-6 max-w-xl mx-auto">
        <DailyRecordSimpleForm />
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}
