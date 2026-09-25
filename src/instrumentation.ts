// Không có cron nào trong hệ thống trước đây (mọi việc định kỳ chạy lazy qua (dashboard)/layout.tsx) —
// đây là lịch chạy ngầm ĐẦU TIÊN, dùng riêng cho việc xoá ảnh bằng chứng hàng không đạt quá hạn 1 tháng
// (RejectedGoodsClassificationItem — xem src/lib/reject-classification-storage.ts). `register()` chỉ
// chạy 1 lần khi tiến trình Next.js khởi động (PM2 giữ tiến trình này sống liên tục trên VPS), không
// chạy lại mỗi request — an toàn để đặt lịch ở đây.
export async function register() {
  // Chỉ đăng ký ở runtime Node.js — import động theo đúng khuyến nghị của Next.js (tránh bundle
  // node-cron/Prisma vào runtime Edge, nơi 2 package này không chạy được).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
