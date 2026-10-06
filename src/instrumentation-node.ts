import cron from "node-cron";
import { cleanupExpiredRejectClassificationPhotos } from "@/lib/reject-classification-storage";
import { cleanupExpiredContaminationProposalPhotos } from "@/lib/contamination-proposal-storage";
import { cleanupExpiredAttendanceSelfies } from "@/lib/attendance-storage";

// Chạy 3h sáng mỗi ngày (giờ server) — khung giờ ít NV thao tác nhất, tránh cạnh tranh tài nguyên với
// lúc NV nhập liệu ban ngày. Lỗi (VD Supabase tạm gián đoạn) chỉ log, không crash tiến trình Next.js —
// lần chạy kế tiếp (24h sau) sẽ thử lại các dòng còn hạn/lỡ hạn.
cron.schedule("0 3 * * *", async () => {
  try {
    const { itemsCleaned } = await cleanupExpiredRejectClassificationPhotos();
    if (itemsCleaned > 0) {
      console.log(`[cron] Đã xoá ảnh hết hạn của ${itemsCleaned} dòng phân loại hàng không đạt`);
    }
  } catch (err) {
    console.error("[cron] Lỗi xoá ảnh phân loại hàng không đạt hết hạn:", err);
  }
});

// Job riêng, không gộp chung callback ở trên — 1 job lỗi (VD bucket lỗi) không chặn job còn lại.
cron.schedule("0 3 * * *", async () => {
  try {
    const { proposalsCleaned } = await cleanupExpiredContaminationProposalPhotos();
    if (proposalsCleaned > 0) {
      console.log(`[cron] Đã xoá ảnh hết hạn của ${proposalsCleaned} đề xuất Trồng/Hủy`);
    }
  } catch (err) {
    console.error("[cron] Lỗi xoá ảnh đề xuất Trồng/Hủy hết hạn:", err);
  }
});

// Ảnh selfie chấm công chỉ giữ 30 ngày (dữ liệu cá nhân) — xoá hẳn khỏi bucket, giữ lại giờ chấm.
cron.schedule("15 3 * * *", async () => {
  try {
    const { recordsCleaned } = await cleanupExpiredAttendanceSelfies();
    if (recordsCleaned > 0) {
      console.log(`[cron] Đã xoá ảnh selfie chấm công hết hạn của ${recordsCleaned} lượt chấm`);
    }
  } catch (err) {
    console.error("[cron] Lỗi xoá ảnh selfie chấm công hết hạn:", err);
  }
});
