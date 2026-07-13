import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import ShelfListView from "../shelf-list-view";

export default async function ChungPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/warehouses"))) redirect("/dashboard");

  const { roomId } = await params;
  const sp = await searchParams;
  const search = sp.q?.trim() ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, code: true, name: true, type: true, warehouseId: true, warehouse: { select: { id: true, code: true, name: true } } },
  });
  if (!room || room.type !== "PHONG_MAU_ME") notFound();

  return (
    <ShelfListView
      room={room as typeof room & { type: "PHONG_MAU_ME" }}
      search={search}
      page={page}
      extraWhere={{ plantTypeId: null, assignedStaffId: null }}
      section="CHUNG"
      backHref={`/warehouses/rooms/${room.id}`}
      backLabel="Về Phòng mẫu mẹ"
      heading={`${room.name} — Kho mẫu mẹ chung`}
      basePath={`/warehouses/rooms/${room.id}/chung`}
    />
  );
}
