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

export const WEBSITE_MAX_LENGTH = 40;

// Domain hợp lệ: cho phép http(s):// và www. đứng trước, ít nhất 1 nhãn + tên miền cấp cao (TLD) từ 2
// ký tự trở lên (VD: abc-company.com, shop.abc.co.uk), có thể có path phía sau nhưng path đó không được
// chứa khoảng trắng (khoảng trắng đã bị chặn riêng ở validateWebsite trước khi tới bước test regex này).
const DOMAIN_REGEX = /^(https?:\/\/)?(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

// Dùng chung cho cả form nhập (validate ngay khi gõ, xem customer-check-form.tsx) lẫn API nhận request
// (/api/customer-check, /api/customer-check/create) — NV bán hàng hay gõ nhầm domain, dán link kèm
// khoảng trắng, hoặc dán nguyên đoạn text dài thay vì link — chặn sớm 3 lỗi này trước khi lưu vào DB.
export function validateWebsite(url: string): string | null {
  const trimmed = url.trim();
  if (/\s/.test(trimmed)) return "Website không được chứa khoảng trắng";
  if (trimmed.length >= WEBSITE_MAX_LENGTH) return `Website phải ngắn hơn ${WEBSITE_MAX_LENGTH} kí tự`;
  if (!DOMAIN_REGEX.test(trimmed)) return "Website phải có domain hợp lệ (VD: abc-company.com)";
  return null;
}

// Phát hiện link trang con (VD abc.com/aboutus, abc.com/shop) để NHẮC NV bán hàng chỉ nhập link trang
// chủ — không chặn lưu (nhiều công ty chỉ có trang giới thiệu ở 1 đường dẫn con thật), chỉ cảnh báo.
// Dấu "/" cuối cùng (trailing slash) không tính là trang con, VD "abc.com/" vẫn coi là trang chủ.
export function hasWebsitePath(url: string): boolean {
  const withoutHost = url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
  return withoutHost.includes("/");
}
