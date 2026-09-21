// Lộ trình đào tạo NV cấy mô thử việc — 9 tuần, mỗi tuần 7 ngày (tuần lịch), tính liên tục từ
// User.probationStartDate (HR điền lúc tạo tài khoản CAY_MO). Nội dung mục tiêu/yêu cầu theo đúng
// chương trình đào tạo thực tế của doanh nghiệp — chỉ hiển thị, không có bước chấm điểm/duyệt trong hệ
// thống (đánh giá đạt/không đạt do quản lý trực tiếp thực hiện ngoài phần mềm).

export type TrainingRequirement = string | { text: string; subItems: string[] };

export type TrainingWeek = {
  week: number;
  goalTitle: string;
  goalLines: string[];
  requirements: TrainingRequirement[];
};

export const TRAINING_ROADMAP_WEEKS: TrainingWeek[] = [
  {
    week: 1,
    goalTitle: "ĐỊNH HƯỚNG & AN TOÀN PHÒNG CẤY",
    goalLines: ["Hiểu nội quy, an toàn lao động, quy trình vô trùng và thao tác cấy cơ bản"],
    requirements: [
      "Tuân thủ nội quy, an toàn lao động",
      "Tuân thủ nguyên tắc vô trùng và kĩ thuật khử trùng",
      "Nhận biết mẫu sạch, mẫu nhiễm",
      "Thực hành thao tác cấy cây vào túi môi trường (không để pank hay cây chạm miệng túi) và gấp túi đúng kỹ thuật (nếp nhỏ, chặt tay)",
    ],
  },
  {
    week: 2,
    goalTitle: "THÀNH THẠO KỸ THUẬT CẤY MẪU MẸ",
    goalLines: ["Đạt tỷ lệ nhiễm sau 7 ngày ủ tối ≤ 5%, đạt tốc độ cấy"],
    requirements: [
      "Thành thạo trong việc kiểm tra mẫu mẹ",
      "Thành thạo kỹ thuật cấy: thao tác cấy cây vào túi môi trường (không để pank hay cây chạm miệng túi) và gấp túi đúng kỹ thuật (nếp nhỏ, chặt tay)",
      "Tỷ lệ nhiễm ≤ 5%",
      "Đạt 650 chồi/cây/ngày",
      {
        text: "Không mắc các lỗi vô trùng nghiêm trọng sau:",
        subItems: [
          "Không khử trùng dụng cụ pank, dao, kéo theo đúng quy định.",
          "Chạm tay hoặc dụng cụ chưa khử trùng vào mẫu.",
          "Để mẫu hoặc miệng túi ra ngoài vùng vô trùng.",
          "Để mẫu tiếp xúc với bề mặt không vô trùng.",
          "Làm rơi mẫu hoặc dụng cụ xuống ngoài vùng vô trùng nhưng vẫn tiếp tục sử dụng.",
          "Cắt đồng thời từ 2 túi môi trường trở lên.",
        ],
      },
    ],
  },
  {
    week: 3,
    goalTitle: "THỰC HÀNH CẤY CÂY SẢN XUẤT ĐÚNG TIÊU CHUẨN",
    goalLines: [
      "Nhận biết đặc điểm và tiêu chuẩn của cây sản xuất.",
      "Làm quen với quy trình cấy cây sản xuất.",
      "Thực hiện đúng kỹ thuật cấy và duy trì thao tác vô trùng.",
      "Khống chế tỉ lệ nhiễm ≤ 5%.",
    ],
    requirements: [
      "Phân biệt được cây sản xuất với cây PD47 (so sánh đặc điểm, mã cây, tiêu chuẩn cây sản xuất, kỹ thuật, thao tác cấy).",
      "Kiểm tra và lựa chọn mẫu sản xuất đạt tiêu chuẩn trước khi cấy.",
      "Đọc và hiểu chỉ định cấy (do quản lý trực tiếp cung cấp).",
      "Xác định đúng điểm cắt của chồi sản xuất theo quy định.",
      "Thực hiện đúng nguyên tắc vô trùng và kĩ thuật khử trùng, kỹ thuật cấy cây sản xuất.",
      "Duy trì tỷ lệ nhiễm ≤ 5%.",
      "Chưa yêu cầu đạt năng suất, ưu tiên thực hiện đúng kỹ thuật.",
    ],
  },
  {
    week: 4,
    goalTitle: "THÀNH THẠO CẤY CÂY SẢN XUẤT ỔN ĐỊNH",
    goalLines: [
      "Thành thạo quy trình cấy cây sản xuất.",
      "Tự thực hiện đầy đủ các công đoạn cấy.",
      "Đảm bảo chất lượng cây, tỷ lệ nhiễm ≤ 5%, và năng suất tối thiểu.",
      "Tiếp tục được hướng dẫn để nâng cao tốc độ.",
    ],
    requirements: [
      "Thực hiện đúng toàn bộ nguyên tắc vô trùng, kỹ thuật khử trùng, quy trình cấy cây sản xuất theo quy định mà không cần người hướng dẫn nhắc nhở.",
      "Thực hiện đúng các thao tác kỹ thuật (kiểm tra mẫu, xác định điểm cắt, cấy cây, gấp túi...) và hạn chế tối đa các lỗi thao tác.",
      "Duy trì tỷ lệ nhiễm ≤ 5%.",
      "Đảm bảo cây sau cấy đạt tiêu chuẩn chất lượng theo chỉ định cấy.",
      "Đạt năng suất tối thiểu theo quy định của tuần (450 chồi/cây/ngày).",
      "Có khả năng tự chuẩn bị dụng cụ, thực hiện công việc và xử lý các tình huống thông thường trong quá trình cấy theo đúng quy định.",
    ],
  },
  {
    week: 5,
    goalTitle: "TĂNG TỐC",
    goalLines: ["Tốc độ 450–525 chồi/ngày, tỷ lệ nhiễm dưới 5%"],
    requirements: [
      "Tăng 15 chồi/cây/ngày.",
      "Duy trì đầy đủ các yêu cầu về kỹ thuật, vô trùng và chất lượng cây đã được đào tạo trong các tuần trước.",
    ],
  },
  {
    week: 6,
    goalTitle: "TĂNG TỐC",
    goalLines: ["Tốc độ 540–615 chồi/ngày, tỷ lệ nhiễm dưới 5%"],
    requirements: [
      "Tăng 15 chồi/cây/ngày.",
      "Duy trì đầy đủ các yêu cầu về kỹ thuật, vô trùng và chất lượng cây đã được đào tạo trong các tuần trước.",
    ],
  },
  {
    week: 7,
    goalTitle: "TĂNG TỐC",
    goalLines: ["Tốc độ 630–705 chồi/ngày, tỷ lệ nhiễm dưới 5%"],
    requirements: [
      "Tăng 15 chồi/cây/ngày.",
      "Duy trì đầy đủ các yêu cầu về kỹ thuật, vô trùng và chất lượng cây đã được đào tạo trong các tuần trước.",
    ],
  },
  {
    week: 8,
    goalTitle: "TĂNG TỐC",
    goalLines: ["Đạt và duy trì tốc độ 725 chồi/ngày, tỷ lệ nhiễm dưới 5%"],
    requirements: [
      "Tăng 15 chồi/cây/ngày.",
      "Duy trì đầy đủ các yêu cầu về kỹ thuật, vô trùng và chất lượng cây đã được đào tạo trong các tuần trước.",
    ],
  },
  {
    week: 9,
    goalTitle: "HOÀN THÀNH ĐÁNH GIÁ THỬ VIỆC",
    goalLines: [
      "Duy trì năng suất ≥ 725 chồi/ngày.",
      "Duy trì tỷ lệ nhiễm ≤ 5%.",
      "Đáp ứng tiêu chuẩn hoàn thành thử việc.",
    ],
    requirements: ["Sẵn sàng đạt yêu cầu tuyển dụng."],
  },
];

// Mỗi "tuần" đào tạo dài đúng 7 ngày (tuần lịch) — tuần N bắt đầu N-1 lần 7 ngày sau ngày bắt đầu thử
// việc, kết thúc 6 ngày sau ngày bắt đầu của chính nó (đủ 7 ngày, tính cả ngày đầu và cuối).
export function getTrainingWeekRange(probationStartDate: Date, week: number): { start: Date; end: Date } {
  const start = new Date(probationStartDate);
  start.setDate(start.getDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

// Tuần đang diễn ra tính theo ngày hiện tại — trả về null nếu chưa tới ngày bắt đầu thử việc, hoặc số
// tuần > totalWeeks nếu đã qua hết lộ trình (NV đã hoàn thành đánh giá thử việc).
export function getCurrentTrainingWeek(probationStartDate: Date, totalWeeks: number): number | null {
  const diffDays = Math.floor((Date.now() - probationStartDate.getTime()) / 86400000);
  if (diffDays < 0) return null;
  return Math.floor(diffDays / 7) + 1 > totalWeeks ? null : Math.floor(diffDays / 7) + 1;
}
