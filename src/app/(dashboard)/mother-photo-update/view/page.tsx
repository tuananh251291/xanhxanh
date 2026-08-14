import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/types";
import MotherPhotoViewBoard from "./mother-photo-view-board";

export default async function MotherPhotoViewPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "KY_THUAT" && !isAdminRole(role)) redirect("/dashboard");

  const plantTypes = await prisma.plantType.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  return (
    <MotherPhotoViewBoard
      plantTypeOptions={plantTypes.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
    />
  );
}
