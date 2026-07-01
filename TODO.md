# TODO — Xanh Xanh

## Phase 2 — Luồng sản xuất & kho mô

### 2.1 Quản lý loại cây & môi trường (Admin)
- [x] Trang `/plant-types` — danh sách, thêm/sửa loại cây
- [x] Trang `/medium-types` — danh sách, thêm/sửa môi trường
- [x] Cài đặt hệ thống `/settings` — dark_room_days, contamination_alert_pct, default_hold_days

### 2.2 Chỉ định cấy (KY_THUAT)
- [x] Trang `/instructions` — danh sách chỉ định, filter theo tuần/trạng thái
- [x] Form tạo chỉ định cấy:
  - Chọn loại cây, mã môi trường
  - Chọn NV cấy (role CAY_MO)
  - Quét/chọn QR kệ nguồn + số lượng mẫu mẹ
  - Điền tỉ lệ nhân (motherSampleRatio, rootingRatio)
  - Hệ thống tự tính expectedMotherOutput, expectedFinishedOutput
- [x] In phiếu chỉ định cấy (print CSS)
- [x] API `POST /api/instructions` — tạo chỉ định, tự sinh code

### 2.3 Nhập dữ liệu cấy hàng ngày (CAY_MO)
- [x] Trang `/my-instructions` — xem chỉ định được giao
- [x] Trang `/daily-record` — form nhập dữ liệu hàng ngày:
  - Số mẫu mẹ đã dùng (motherUsed)
  - Số mẫu mẹ tạo ra (tạo Lot mới MAU_ME)
  - Số thành phẩm tạo ra (tạo Lot mới THANH_PHAM)
  - Tự động trừ tồn mẫu mẹ nguồn — _chưa làm, thiếu field liên kết lô mẫu mẹ nguồn trên DailyRecord/PlantingInstruction, cần thiết kế schema riêng_
- [x] Cảnh báo lệch output so với chỉ định (>20%)
- [x] API `POST /api/daily-records` — tạo nhật ký, cập nhật Lot _(fix: payload trước đây không khớp giữa FE/BE — CAY_MO không thể nộp nhật ký)_

### 2.4 Lọc nhiễm (CAY_MO)
- [x] Trang `/my-dark-room` — xem phòng tối cá nhân
- [x] Form báo cáo nhiễm: chọn Lot, nhập số lượng nhiễm
- [x] API `POST /api/contamination` — tạo record, trừ tồn Lot

### 2.5 Bàn giao phòng tối → kho sáng (KHO_MO)
- [x] Trang `/transfers/receive` — danh sách bàn giao chờ xác nhận
- [x] Xác nhận nhận cây từ phòng tối
- [x] Hệ thống gợi ý vị trí kệ trống trong kho sáng
- [x] Xác nhận sắp xếp → cập nhật shelfId của Lot, cộng tồn kho sáng
- [x] API `POST /api/transfers` — tạo phiếu bàn giao
- [x] API `PATCH /api/transfers/[id]` — xác nhận/từ chối bàn giao

### 2.6 Bàn giao mẫu mẹ cho NV cấy (KHO_MO)
- [x] Trang `/transfers/send` — chọn chỉ định, chọn lô mẫu mẹ theo QR kệ
- [x] Tạo phiếu bàn giao cho NV cấy
- [x] Khi NV cấy xác nhận → trừ tồn kho sáng

### 2.7 Bàn giao thành phẩm → kho thành phẩm (KHO_MO)
- [x] Trang `/transfers/finished` — danh sách lô thành phẩm đủ tuổi
- [x] Hệ thống đề xuất lô đến hạn (enteredAt + lightRoomWeeksMax)
- [x] Tạo phiếu bàn giao sang kho thành phẩm
- [x] API cập nhật Lot status → TRANSFERRED, chuyển warehouse

### 2.8 Tồn kho
- [x] Trang `/inventory/kho-sang` — tồn kho sáng theo kệ/lô
- [x] Trang `/inventory/all` — tổng hợp tất cả kho (DIEU_PHOI, ADMIN)
- [x] Filter theo loại cây, stage, trạng thái lô
- [x] Hiển thị lô sắp hết hạn (màu cam/đỏ)

### 2.9 Môi trường (MOI_TRUONG)
- [x] Trang `/medium/tasks` — tổng hợp mã môi trường theo chỉ định cấy tuần này
- [ ] Phiếu bàn giao nhận môi trường — _chưa làm, chưa có model riêng cho việc bàn giao môi trường_

### 2.10 Chưa có trong nav nhưng thiếu trang (phát hiện khi rà soát ROLE_NAV)
- [x] `/contamination` (KHO_MO) — trang lọc nhiễm riêng, xác nhận báo cáo nhiễm
- [x] `/my-reports` (CAY_MO) — báo cáo sản lượng & tỉ lệ nhiễm cá nhân
- [ ] `/reports`, `/reports/production` (ADMIN, KY_THUAT) — chưa có, để dành cho Phase 4 (biểu đồ/báo cáo)
- [ ] `/alerts` — link cố định ở sidebar cho mọi role nhưng chưa có trang (404), cần trang danh sách cảnh báo cơ bản

---

## Phase 3 — Bán hàng & kho thành phẩm

- [ ] Trang `/inventory/available` — tồn khả dụng (SALE xem)
- [ ] Trang `/orders` — tạo/quản lý đơn hàng
- [ ] Logic holdUntil: tự động cancel khi quá hạn
- [ ] Trang `/orders/pack` — sắp đơn đã xác nhận (KHO_THANH_PHAM)
- [ ] Kiểm tồn cuối tháng

---

## Phase 4 — Dashboard nâng cao & tiện ích

- [ ] Biểu đồ sản lượng theo tuần/tháng
- [ ] Biểu đồ tỉ lệ nhiễm theo NV cấy
- [ ] Báo cáo hiệu suất NV (xuất Excel)
- [ ] QR scan bằng camera điện thoại (html5-qrcode)
- [ ] Realtime alerts (Supabase Realtime)
- [ ] Checklist đầu việc hàng ngày per role
- [ ] In phiếu bàn giao (print CSS)
