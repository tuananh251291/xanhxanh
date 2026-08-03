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
  // Header bảo mật cơ bản áp cho MỌI response — không dùng frame-ancestors/CSP quá chặt vì có thể chặn
  // nhầm asset của Next.js (script inline lúc hydrate, font Google) nếu không tính kỹ; ưu tiên các header
  // rẻ-mà-chắc-chắn-an-toàn trước (không phá UI), CSP để riêng có ghi chú rõ từng nguồn cho phép.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Ép trình duyệt LUÔN dùng HTTPS cho domain này (kể cả gõ thẳng http://) trong 1 năm, áp dụng
          // cả subdomain — an toàn vì nginx đã redirect http->https sẵn (xem site config), header này chỉ
          // rút ngắn bước redirect ở các lần truy cập sau + chặn downgrade attack.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Chặn nhúng trang này vào <iframe> ở domain khác (chống clickjacking) — ứng dụng nội bộ, không
          // có nhu cầu bị nhúng iframe từ bất kỳ đâu.
          { key: "X-Frame-Options", value: "DENY" },
          // Chặn trình duyệt tự đoán loại file khác Content-Type khai báo (chống 1 số kiểu tấn công XSS
          // qua file upload bị hiểu nhầm thành .html/.js).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Không gửi URL đầy đủ (có thể chứa token/id nhạy cảm trong query) sang site khác khi bấm link
          // ra ngoài — chỉ gửi origin. Vẫn gửi đủ referrer khi ở lại cùng origin (không phá analytics nội bộ).
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Tắt hẳn các quyền trình duyệt không dùng tới (camera/mic/định vị) — ứng dụng quản lý kho không
          // cần, giảm bề mặt tấn công nếu có script lạ lọt vào.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
