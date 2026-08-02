import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép truy cập dev server từ điện thoại/thiết bị khác qua IP LAN (Next.js mặc định chỉ cho phép
  // localhost để chặn cross-origin request tới các asset/endpoint chỉ dùng khi dev). IP này do router
  // DHCP cấp cho máy dev — có thể đổi sau khi khởi động lại máy/router, lúc đó cần cập nhật lại đây (xem
  // "Network:" in log lúc `npm run dev` khởi động, hoặc chạy `ipconfig`).
  allowedDevOrigins: ["192.168.1.19", "192.168.1.21", "192.168.1.32", "192.168.1.178", "192.168.1.221"],
  // pdf-parse (đọc invoice PDF, xem /api/price-check) dùng pdfjs-dist bên trong, tự dynamic-import 1
  // worker file (pdf.worker.mjs) lúc chạy — Next.js bundler không resolve được path này nếu bundle
  // chung vào server code, báo lỗi "Cannot find module ... pdf.worker.mjs". Để nguyên là package
  // ngoài (không bundle) thì chạy đúng như package gốc, không bị lỗi này.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
