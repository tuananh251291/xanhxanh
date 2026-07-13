import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Toaster } from "@/components/ui/sonner";
import BasicPageHeader from "../basic-page-header";
import MotherReceiveList from "./mother-receive-list";

export default async function NhanMauMePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CAY_MO") redirect("/dashboard-basic");

  const instructions = await prisma.plantingInstruction.findMany({
    where: {
      assignedToId: session.user.id,
      status: { in: ["ACTIVE", "DRAFT"] },
      handedOverAt: { not: null },
      motherReceivedAt: null,
    },
    include: { plantType: { select: { code: true, name: true } } },
    orderBy: { handedOverAt: "asc" },
  });

  const pending = instructions.map((inst) => ({
    id: inst.id,
    code: inst.code,
    plantTypeCode: inst.plantType.code,
    plantTypeName: inst.plantType.name,
    inputMotherQuantity: inst.inputMotherQuantity,
    weekStart: inst.weekStart ? inst.weekStart.toISOString() : null,
  }));

  return (
    <div className="min-h-screen bg-background">
      <BasicPageHeader title="Nhận bàn giao mẫu mẹ" />
      <div className="p-4 sm:p-6 max-w-xl mx-auto">
        <MotherReceiveList instructions={pending} />
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}
