import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import BasicPageHeader from "../basic-page-header";
import HandoverSimpleForm from "./handover-simple-form";

export default async function BanGiaoPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CAY_MO") redirect("/dashboard-basic");

  return (
    <div className="min-h-screen bg-background">
      <BasicPageHeader title="Bàn giao sản phẩm" />
      <div className="p-4 sm:p-6 max-w-xl mx-auto">
        <HandoverSimpleForm />
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}
