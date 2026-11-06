// CHỈ chạy 1 lần: ngay sau db:push thêm PriceList.effectiveFrom, TRƯỚC khi khởi động code mới. Bảng tải trước đó áp dụng từ
// ngày 1 của tháng đã chọn. Chạy lại sau khi đã có bảng điền ngày giữa tháng sẽ ghi đè mất ngày áp dụng của các bảng đó.
import { prisma } from "../src/lib/prisma";

async function main() {
  const n = await prisma.$executeRaw`UPDATE price_lists SET "effectiveFrom" = month`;
  console.log(`Đã cập nhật ${n} bảng giá`);
}
main().finally(() => prisma.$disconnect());
