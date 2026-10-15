import type { RoomType } from "@prisma/client";

// 4 loại phòng thuộc kho thành phẩm dùng cho đề xuất Trồng/Hủy + luồng "Thực hiện" nhiệm vụ ngày — dùng
// chung giữa POST /api/contamination-proposals, /contamination-proposals/page.tsx và
// /task-assignment/de-xuat/[taskId]/page.tsx.
export const FINISHED_GOODS_ROOM_TYPES: RoomType[] = ["PHONG_DAT_TIEU_CHUAN", "PHONG_CHO_XU_LY", "PHONG_THI_TRUONG"];
