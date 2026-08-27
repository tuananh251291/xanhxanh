import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { parse, isValid, endOfDay } from "date-fns";

// Báo cáo "Tổng hợp Nhập - Xuất" — cho Admin (mọi kho, lọc được theo kho) + Quản lý kho thành phẩm (CHỈ
// đúng kho mình phụ trách — luôn ép warehouseId theo workplaceWarehouseId, bỏ qua tham số client, tránh
// xem chéo kho khác). Lọc theo khoảng ngày (from/to) — khác báo cáo "Hàng nhập đạt từ NCC" (lọc theo
// tháng) vì đây gộp nhiều nguồn có ý nghĩa khác nhau, cho phép xem tuỳ ý.
//
// 4 nguồn dữ liệu (tổng nhập = incoming.totalPassed; tổng xuất = orders + production + proposals):
// - Nhập NCC: GoodsReceipt CONFIRMED, supplierId khác NULL — lọc theo confirmedAt (fallback createdAt
//   cho phiếu CONFIRMED cũ tạo thẳng, không qua PATCH confirm nên confirmedAt NULL).
// - Xuất đơn hàng: Order status=SHIPPED — lọc theo shippedAt, group theo customerCode.
// - Xuất khu sản xuất: Transfer CONFIRMED mà CẢ fromWarehouse lẫn toWarehouse đều type=THANH_PHAM (luân
//   chuyển tự do giữa các phòng trong kho thành phẩm, NV gọi là "Trả hàng Kho Sản xuất" dù không rời khỏi
//   kho — xem transfers/send/page.tsx) — lọc theo confirmedAt, group theo phòng đích.
// - Xuất trồng/hủy: ContaminationProposal status=APPROVED — lọc theo createdAt (lô đã trừ thật lúc gửi đề
//   xuất, approvedAt chỉ là mốc Admin duyệt sau đó — xem POST /api/contamination-proposals), group theo
//   type (Trồng/Hủy) + loại cây.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "QUAN_LY_KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const requestedWarehouseId = searchParams.get("warehouseId") || undefined;
  const warehouseId = role === "QUAN_LY_KHO_THANH_PHAM" ? (session?.user?.workplaceWarehouseId ?? "__none__") : requestedWarehouseId;

  const parsedFrom = fromParam ? parse(fromParam, "yyyy-MM-dd", new Date()) : null;
  const parsedTo = toParam ? parse(toParam, "yyyy-MM-dd", new Date()) : null;
  const rangeStart = parsedFrom && isValid(parsedFrom) ? parsedFrom : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const rangeEnd = parsedTo && isValid(parsedTo) ? endOfDay(parsedTo) : endOfDay(new Date());

  const [receipts, orderItems, productionTransfers, proposals] = await Promise.all([
    // Nhập NCC
    prisma.goodsReceipt.findMany({
      where: {
        status: "CONFIRMED",
        supplierId: { not: null },
        ...(warehouseId ? { room: { warehouseId } } : {}),
        OR: [
          { confirmedAt: { gte: rangeStart, lte: rangeEnd } },
          { confirmedAt: null, createdAt: { gte: rangeStart, lte: rangeEnd } },
        ],
      },
      select: {
        supplierId: true,
        supplier: { select: { code: true, name: true } },
        items: { select: { quantityDelivered: true, quantityPassed: true } },
      },
    }),
    // Xuất đơn hàng
    prisma.orderItem.findMany({
      where: {
        order: { status: "SHIPPED", shippedAt: { gte: rangeStart, lte: rangeEnd } },
        ...(warehouseId ? { lot: { room: { warehouseId } } } : {}),
      },
      select: { quantity: true, order: { select: { id: true, customerCode: true } } },
    }),
    // Xuất khu sản xuất (luân chuyển nội bộ kho thành phẩm)
    prisma.transfer.findMany({
      where: {
        status: "CONFIRMED",
        confirmedAt: { gte: rangeStart, lte: rangeEnd },
        fromWarehouse: { type: "THANH_PHAM" },
        toWarehouse: { type: "THANH_PHAM" },
        ...(warehouseId ? { fromWarehouseId: warehouseId } : {}),
      },
      select: {
        toRoomId: true,
        toRoom: { select: { name: true } },
        items: { select: { quantity: true } },
      },
    }),
    // Xuất trồng/hủy
    prisma.contaminationProposal.findMany({
      where: {
        status: "APPROVED",
        createdAt: { gte: rangeStart, lte: rangeEnd },
        ...(warehouseId ? { warehouseId } : {}),
      },
      select: {
        type: true,
        quantity: true,
        plantTypeId: true,
        plantType: { select: { code: true, name: true } },
      },
    }),
  ]);

  // --- Nhập NCC ---
  const bySupplier = new Map<string, { code: string; name: string; delivered: number; passed: number; receiptCount: number }>();
  for (const r of receipts) {
    if (!r.supplierId || !r.supplier) continue;
    const entry = bySupplier.get(r.supplierId) ?? { code: r.supplier.code, name: r.supplier.name, delivered: 0, passed: 0, receiptCount: 0 };
    entry.receiptCount += 1;
    for (const item of r.items) {
      entry.delivered += item.quantityDelivered;
      entry.passed += item.quantityPassed;
    }
    bySupplier.set(r.supplierId, entry);
  }
  const incomingBySupplier = Array.from(bySupplier.entries())
    .map(([supplierId, e]) => ({ supplierId, supplierCode: e.code, supplierName: e.name, receiptCount: e.receiptCount, totalDelivered: e.delivered, totalPassed: e.passed }))
    .sort((a, b) => b.totalPassed - a.totalPassed || a.supplierName.localeCompare(b.supplierName));
  const totalIn = incomingBySupplier.reduce((s, r) => s + r.totalPassed, 0);

  // --- Xuất đơn hàng ---
  const byCustomer = new Map<string, { quantity: number; orderIds: Set<string> }>();
  for (const oi of orderItems) {
    const entry = byCustomer.get(oi.order.customerCode) ?? { quantity: 0, orderIds: new Set<string>() };
    entry.quantity += oi.quantity;
    entry.orderIds.add(oi.order.id);
    byCustomer.set(oi.order.customerCode, entry);
  }
  const outgoingByOrder = Array.from(byCustomer.entries())
    .map(([customerCode, e]) => ({ customerCode, orderCount: e.orderIds.size, totalQuantity: e.quantity }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity || a.customerCode.localeCompare(b.customerCode));
  const totalOutOrders = outgoingByOrder.reduce((s, r) => s + r.totalQuantity, 0);

  // --- Xuất khu sản xuất ---
  const byRoom = new Map<string, { name: string; quantity: number; transferCount: number }>();
  for (const t of productionTransfers) {
    if (!t.toRoomId || !t.toRoom) continue;
    const entry = byRoom.get(t.toRoomId) ?? { name: t.toRoom.name, quantity: 0, transferCount: 0 };
    entry.transferCount += 1;
    for (const item of t.items) entry.quantity += item.quantity;
    byRoom.set(t.toRoomId, entry);
  }
  const outgoingByProduction = Array.from(byRoom.entries())
    .map(([roomId, e]) => ({ roomId, roomName: e.name, transferCount: e.transferCount, totalQuantity: e.quantity }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity || a.roomName.localeCompare(b.roomName));
  const totalOutProduction = outgoingByProduction.reduce((s, r) => s + r.totalQuantity, 0);

  // --- Xuất trồng/hủy ---
  const byProposal = new Map<string, { type: "TRONG" | "HUY"; plantTypeCode: string; plantTypeName: string; quantity: number; proposalCount: number }>();
  for (const p of proposals) {
    const key = `${p.type}:${p.plantTypeId}`;
    const entry = byProposal.get(key) ?? { type: p.type, plantTypeCode: p.plantType.code, plantTypeName: p.plantType.name, quantity: 0, proposalCount: 0 };
    entry.proposalCount += 1;
    entry.quantity += p.quantity;
    byProposal.set(key, entry);
  }
  const outgoingByProposal = Array.from(byProposal.values())
    .map((e) => ({ type: e.type, plantTypeCode: e.plantTypeCode, plantTypeName: e.plantTypeName, proposalCount: e.proposalCount, totalQuantity: e.quantity }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity || a.plantTypeName.localeCompare(b.plantTypeName));
  const totalOutProposal = outgoingByProposal.reduce((s, r) => s + r.totalQuantity, 0);

  return NextResponse.json({
    rangeStart,
    rangeEnd,
    summary: {
      totalIn,
      totalOut: totalOutOrders + totalOutProduction + totalOutProposal,
      totalOutOrders,
      totalOutProduction,
      totalOutProposal,
    },
    incomingBySupplier,
    outgoingByOrder,
    outgoingByProduction,
    outgoingByProposal,
  });
}
