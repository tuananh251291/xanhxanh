import { prisma } from "@/lib/prisma";

// Các từ chỉ loại hình pháp lý của công ty — bỏ qua khi so khớp trùng khách, để "AAA" và "AAA, Ltd" hay
// "AAA Co., Ltd" được coi là cùng 1 khách. Chỉ gồm từ chỉ LOẠI HÌNH công ty (không gồm các từ mô tả
// ngành nghề như "Trading"/"Group"/"Import Export" — những từ đó vẫn mang nghĩa phân biệt, giữ nguyên
// để tránh gộp nhầm 2 công ty khác nhau).
const COMPANY_SUFFIX_WORDS = new Set([
  "co", "ltd", "limited", "company", "inc", "incorporated", "corp", "corporation",
  "llc", "llp", "plc", "gmbh", "ag", "sa", "srl", "spa", "pte", "pty", "bv", "nv",
  "kk", "jsc", "tnhh", "cty",
]);

// Lowercase, gộp khoảng trắng thừa, bỏ dấu câu (dấu phẩy/chấm/ngoặc...) rồi bỏ luôn các từ chỉ loại hình
// công ty (Co, Ltd, Inc...) — để "ABC   Company", " abc company ", "ABC, Ltd", "ABC Co., Ltd" đều so
// khớp trùng được với nhau. Nếu bỏ hết chỉ còn rỗng (tên gốc chỉ toàn từ loại hình, hiếm gặp) thì giữ
// nguyên bản đã gộp khoảng trắng, tránh mọi công ty tên "Ltd"/"Co" trần trụi bị coi là trùng nhau.
export function normalizeCustomerName(name: string): string {
  const base = name.trim().toLowerCase().replace(/\s+/g, " ");
  const words = base.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const stripped = words.filter((w) => !COMPANY_SUFFIX_WORDS.has(w)).join(" ");
  return stripped || base;
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
