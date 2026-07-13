import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép truy cập dev server từ điện thoại/thiết bị khác qua IP LAN (Next.js mặc định chỉ cho phép
  // localhost để chặn cross-origin request tới các asset/endpoint chỉ dùng khi dev). IP này do router
  // DHCP cấp cho máy dev — có thể đổi sau khi khởi động lại máy/router, lúc đó cần cập nhật lại đây (xem
  // "Network:" in log lúc `npm run dev` khởi động, hoặc chạy `ipconfig`).
  allowedDevOrigins: ["192.168.1.19", "192.168.1.21"],
};

export default nextConfig;
