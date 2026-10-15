import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Nhập Excel phân công Nhân viên quản lý (Cài đặt Sale → Nhân viên quản lý). Mỗi dòng = (Mã NV quản lý, Mã
// NV bán hàng, Mã thị trường) → upsert SalesManagerAssignment theo (NV bán hàng, thị trường), giống hệt nút Lưu
// trên bảng. Dòng KHÔNG có trong file giữ nguyên (không xoá). File có lỗi ở bất kỳ dòng nào → từ chối cả file.

export type SalesManagerImportRow = { row: number; managerCode: string; salesCode: string; marketCode: string };
export type SalesManagerImportError = { row: number; message: string };
export type ResolvedRow = SalesManagerImportRow & {
  managerId: string;
  managerName: string;
  salesUserId: string;
  salesName: string;
  marketId: string;
  marketName: string;
  // Phân công hiện có của (NV bán hàng, thị trường) — để hiện "thêm mới" / "đổi quản lý" / "không đổi".
  currentManagerName: string | null;
  change: "new" | "update" | "same";
};

export async function validateSalesManagerRows(rows: SalesManagerImportRow[]) {
  const errors: SalesManagerImportError[] = [];
  if (rows.length === 0) errors.push({ row: 0, message: "File không có dòng dữ liệu nào (dòng 1 là tiêu đề, dòng 2 là ví dụ)" });

  const userCodes = [...new Set(rows.flatMap((r) => [r.managerCode, r.salesCode]).filter(Boolean))];
  const marketCodes = [...new Set(rows.map((r) => r.marketCode).filter(Boolean))];
  const [users, markets] = await Promise.all([
    prisma.user.findMany({ where: { code: { in: userCodes } }, select: { id: true, code: true, name: true, role: true, isActive: true } }),
    prisma.market.findMany({ where: { code: { in: marketCodes } }, select: { id: true, code: true, name: true, isActive: true } }),
  ]);
  const userByCode = new Map(users.map((u) => [u.code.toUpperCase(), u]));
  const marketByCode = new Map(markets.map((m) => [m.code.toUpperCase(), m]));

  const seen = new Map<string, number>();
  const resolved: Omit<ResolvedRow, "currentManagerName" | "change">[] = [];
  for (const r of rows) {
    const missing = [!r.managerCode && "Mã NV quản lý", !r.salesCode && "Mã NV bán hàng", !r.marketCode && "Mã thị trường"].filter(Boolean);
    if (missing.length) { errors.push({ row: r.row, message: `Thiếu ${missing.join(", ")}` }); continue; }
    const manager = userByCode.get(r.managerCode.toUpperCase());
    const sales = userByCode.get(r.salesCode.toUpperCase());
    const market = marketByCode.get(r.marketCode.toUpperCase());
    const rowErrors: string[] = [];
    if (!manager) rowErrors.push(`Không có NV mã "${r.managerCode}"`);
    else if (manager.role !== "SALE" || !manager.isActive) rowErrors.push(`NV quản lý "${r.managerCode}" không phải NV bán hàng đang làm việc`);
    if (!sales) rowErrors.push(`Không có NV mã "${r.salesCode}"`);
    else if (sales.role !== "SALE" || !sales.isActive) rowErrors.push(`NV "${r.salesCode}" không phải NV bán hàng đang làm việc`);
    if (!market) rowErrors.push(`Không có thị trường mã "${r.marketCode}"`);
    else if (!market.isActive) rowErrors.push(`Thị trường "${r.marketCode}" đã ngừng hoạt động`);
    if (sales && market) {
      const key = `${sales.id}::${market.id}`;
      const first = seen.get(key);
      if (first) rowErrors.push(`Trùng NV bán hàng + thị trường với dòng ${first}`);
      else seen.set(key, r.row);
    }
    if (rowErrors.length) { errors.push({ row: r.row, message: rowErrors.join("; ") }); continue; }
    resolved.push({
      ...r,
      managerId: manager!.id, managerName: manager!.name,
      salesUserId: sales!.id, salesName: sales!.name,
      marketId: market!.id, marketName: market!.name,
    });
  }

  const current = resolved.length
    ? await prisma.salesManagerAssignment.findMany({
        where: { OR: resolved.map((r) => ({ salesUserId: r.salesUserId, marketId: r.marketId })) },
        select: { salesUserId: true, marketId: true, managerId: true, manager: { select: { name: true } } },
      })
    : [];
  const currentByKey = new Map(current.map((c) => [`${c.salesUserId}::${c.marketId}`, c]));
  const withChange: ResolvedRow[] = resolved.map((r) => {
    const c = currentByKey.get(`${r.salesUserId}::${r.marketId}`);
    return { ...r, currentManagerName: c?.manager.name ?? null, change: !c ? "new" : c.managerId === r.managerId ? "same" : "update" };
  });
  return { errors, resolved: withChange };
}

export async function applySalesManagerRows(tx: Prisma.TransactionClient, rows: ResolvedRow[]) {
  for (const r of rows) {
    if (r.change === "same") continue;
    await tx.salesManagerAssignment.upsert({
      where: { salesUserId_marketId: { salesUserId: r.salesUserId, marketId: r.marketId } },
      update: { managerId: r.managerId },
      create: { salesUserId: r.salesUserId, managerId: r.managerId, marketId: r.marketId },
    });
  }
  return { created: rows.filter((r) => r.change === "new").length, updated: rows.filter((r) => r.change === "update").length };
}
