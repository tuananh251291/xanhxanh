import { prisma } from "@/lib/prisma";

// Lowercase + gộp mọi khoảng trắng liên tiếp (kể cả đầu/cuối, giữa các từ, tab...) về đúng 1 dấu cách —
// để "ABC   Company", " abc company ", "Abc Company" đều so khớp trùng được với nhau.
export function normalizeCustomerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Bỏ protocol (http/https), tiền tố www., dấu / cuối, VÀ mọi khoảng trắng (URL không có khoảng trắng
// hợp lệ — khoảng trắng lọt vào thường do gõ nhầm/copy-paste) — để "https://Www.Abc.com/" và "abc.com"
// so khớp được với nhau khi kiểm tra trùng khách.
export function normalizeWebsite(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

// "Nhân viên quản lý" của 1 khách hàng KHÔNG lưu cứng trên Customer — suy ra runtime từ
// SalesManagerAssignment(salesUserId=assignedToId, marketId) tại thời điểm xem, xem prisma/schema.prisma.
export async function getCustomerManager(assignedToId: string | null, marketId: string) {
  if (!assignedToId) return null;
  const assignment = await prisma.salesManagerAssignment.findUnique({
    where: { salesUserId_marketId: { salesUserId: assignedToId, marketId } },
    select: { manager: { select: { id: true, code: true, name: true } } },
  });
  return assignment?.manager ?? null;
}
