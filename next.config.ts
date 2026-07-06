import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép truy cập dev server từ điện thoại/thiết bị khác qua IP LAN (Next.js mặc định chỉ cho phép
  // localhost để chặn cross-origin request tới các asset/endpoint chỉ dùng khi dev).
  allowedDevOrigins: ["192.168.1.19"],
};

export default nextConfig;
