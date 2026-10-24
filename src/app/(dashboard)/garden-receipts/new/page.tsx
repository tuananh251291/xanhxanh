import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPageAllowed } from "@/lib/permissions";
import { getGardenReceiptSender, getKtpSourceRooms, getSenderMovableLots } from "@/lib/garden-receipt";
import { summarizeMovable } from "@/lib/room-move";
import GardenReceiptForm, { type SourceOption } from "./garden-receipt-form";

async function toOptions(byKey: Map<string, number>) {
  if (byKey.size === 0) return [];
  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: [...new Set([...byKey.keys()].map((k) => k.split(":")[0]))] } },
    select: { id: true, code: true, name: true },
  });
  const ptById = new Map(plantTypes.map((p) => [p.id, p]));
  return [...byKey]
    .map(([key, quantity]) => {
      const [plantTypeId, stageCode] = key.split(":");
      const pt = ptById.get(plantTypeId)!;
      return { plantTypeId, plantTypeCode: pt.code, plantTypeName: pt.name, stageCode, quantity };
    })
    .sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode) || a.stageCode.localeCompare(b.stageCode));
}

// Lập phiếu bàn giao cây mô về vườn — Kho thành phẩm (chọn Phòng đạt tiêu chuẩn/Phòng chờ xử lý) hoặc Kho mô
// khu sản xuất (thành phẩm Phòng ra rễ). Xem POST /api/garden-receipts.
export default async function NewGardenReceiptPage() {
  const session = await auth();
  if (!session?.user || !(await isPageAllowed(session.user.role, "/garden-receipts"))) redirect("/dashboard");
  const sender = await getGardenReceiptSender(session.user);
  if (!sender) redirect("/garden-receipts");

  const [gardens, sales] = await Promise.all([
    prisma.productionGarden.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    // NV bán hàng đặt hàng — chọn khi lệnh sản xuất có kế hoạch.
    prisma.user.findMany({ where: { role: "SALE", isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  let sources: SourceOption[];
  if (sender.kind === "KTP") {
    const rooms = await getKtpSourceRooms(sender.warehouseId);
    sources = await Promise.all(
      rooms.map(async (r) => ({ roomId: r.id, label: r.name, stock: await toOptions(summarizeMovable(await getSenderMovableLots(sender, r.id))) }))
    );
  } else {
    sources = [{ roomId: null, label: "Phòng ra rễ (thành phẩm)", stock: await toOptions(summarizeMovable(await getSenderMovableLots(sender, null))) }];
  }

  return <GardenReceiptForm warehouseName={sender.warehouseName} gardens={gardens} sources={sources} sales={sales} />;
}
