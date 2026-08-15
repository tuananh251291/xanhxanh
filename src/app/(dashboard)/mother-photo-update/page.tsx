import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { startOfWeek } from "date-fns";
import { toStoredWeekStart, MOTHER_PHOTO_TRACKING_CUTOFF } from "@/lib/week-rotation";
import MotherPhotoUpdateBoard from "./mother-photo-update-board";

export default async function MotherPhotoUpdatePage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "KY_THUAT") redirect("/dashboard");

  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const [activePlantTypes, photographedThisWeek] = await Promise.all([
    prisma.lot.findMany({
      // Chỉ tính giàn ĐÃ GẮN cho nhân sự (không tính "kệ chung") VÀ nhập kho sáng từ
      // MOTHER_PHOTO_TRACKING_CUTOFF trở đi (lô cũ hơn không tính vào nhiệm vụ).
      where: {
        stage: "MAU_ME",
        status: "ACTIVE",
        quantity: { gt: 0 },
        shelf: { assignedStaffId: { not: null } },
        enteredAt: { gte: MOTHER_PHOTO_TRACKING_CUTOFF },
      },
      distinct: ["plantTypeId"],
      select: { plantTypeId: true },
    }),
    prisma.motherPhoto.findMany({
      where: { takenById: session!.user.id, weekStart },
      distinct: ["plantTypeId"],
      select: { plantTypeId: true },
    }),
  ]);

  return (
    <MotherPhotoUpdateBoard
      totalPlantTypes={activePlantTypes.length}
      initialPhotographedPlantTypeIds={photographedThisWeek.map((p) => p.plantTypeId)}
    />
  );
}
