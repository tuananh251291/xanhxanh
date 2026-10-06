import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { startOfWeek } from "date-fns";
import { toStoredWeekStart } from "@/lib/week-rotation";
import MotherPhotoUpdateBoard from "./mother-photo-update-board";

export default async function MotherPhotoUpdatePage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "KY_THUAT") redirect("/dashboard");

  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // NV Kỹ thuật kho nào làm cho kho đó (User.workplaceWarehouseId) — chưa gắn kho thì tính mọi kho như cũ.
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { workplaceWarehouse: { select: { id: true, name: true } } },
  });
  const warehouse = user?.workplaceWarehouse ?? null;
  const shelfWhere = { assignedStaffId: { not: null }, ...(warehouse ? { warehouseId: warehouse.id } : {}) };

  const [activePlantTypes, photographedThisWeek] = await Promise.all([
    prisma.lot.findMany({
      // Chỉ tính giàn ĐÃ GẮN cho nhân sự — không cần cập nhật ảnh cho lô ở "kệ chung".
      where: { stage: "MAU_ME", status: "ACTIVE", quantity: { gt: 0 }, shelf: shelfWhere },
      distinct: ["plantTypeId"],
      select: { plantTypeId: true },
    }),
    prisma.motherPhoto.findMany({
      where: { takenById: session!.user.id, weekStart, ...(warehouse ? { shelf: { warehouseId: warehouse.id } } : {}) },
      distinct: ["plantTypeId"],
      select: { plantTypeId: true },
    }),
  ]);

  return (
    <MotherPhotoUpdateBoard
      totalPlantTypes={activePlantTypes.length}
      initialPhotographedPlantTypeIds={photographedThisWeek.map((p) => p.plantTypeId)}
      warehouseName={warehouse?.name ?? null}
    />
  );
}
