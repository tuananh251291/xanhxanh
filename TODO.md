# TODO — Xanh Xanh

## Phase 2 — Luồng sản xuất & kho mô

### 2.1 Quản lý loại cây & môi trường (Admin)
- [ ] Trang `/plant-types` — danh sách, thêm/sửa loại cây
- [ ] Trang `/medium-types` — danh sách, thêm/sửa môi trường
- [ ] Cài đặt hệ thống `/settings` — dark_room_days, contamination_alert_pct, default_hold_days

### 2.2 Chỉ định cấy (KY_THUAT)
- [ ] Trang `/instructions` — danh sách chỉ định, filter theo tuần/trạng thái
- [ ] Form tạo chỉ định cấy:
  - Chọn loại cây, mã môi trường
  - Chọn NV cấy (role CAY_MO)
  - Quét/chọn QR kệ nguồn + số lượng mẫu mẹ
  - Điền tỉ lệ nhân (motherSampleRatio, rootingRatio)
  - Hệ thống tự tính expectedMotherOutput, expectedFinishedOutput
- [ ] In phiếu chỉ định cấy (print CSS)
- [ ] API `POST /api/instructions` — tạo chỉ định, tự sinh code

### 2.3 Nhập dữ liệu cấy hàng ngày (CAY_MO)
- [ ] Trang `/my-instructions` — xem chỉ định được giao
- [ ] Trang `/daily-record` — form nhập dữ liệu hàng ngày:
  - Số mẫu mẹ đã dùng (motherUsed)
  - Số mẫu mẹ tạo ra (tạo Lot mới MAU_ME)
  - Số thành phẩm tạo ra (tạo Lot mới THANH_PHAM)
  - Tự động trừ tồn mẫu mẹ nguồn
- [ ] Cảnh báo lệch output so với chỉ định (>20%)
- [ ] API `POST /api/daily-records` — tạo nhật ký, cập nhật Lot

### 2.4 Lọc nhiễm (CAY_MO)
- [ ] Trang `/my-dark-room` — xem phòng tối cá nhân
- [ ] Form báo cáo nhiễm: chọn Lot, nhập số lượng nhiễm
- [ ] API `POST /api/contamination` — tạo record, trừ tồn Lot

### 2.5 Bàn giao phòng tối → kho sáng (KHO_MO)
- [ ] Trang `/transfers/receive` — danh sách bàn giao chờ xác nhận
- [ ] Xác nhận nhận cây từ phòng tối
- [ ] Hệ thống gợi ý vị trí kệ trống trong kho sáng
- [ ] Xác nhận sắp xếp → cập nhật shelfId của Lot, cộng tồn kho sáng
- [ ] API `POST /api/transfers` — tạo phiếu bàn giao
- [ ] API `PATCH /api/transfers/[id]` — xác nhận/từ chối bàn giao

### 2.6 Bàn giao mẫu mẹ cho NV cấy (KHO_MO)
- [ ] Trang `/transfers/send` — chọn chỉ định, chọn lô mẫu mẹ theo QR kệ
- [ ] Tạo phiếu bàn giao cho NV cấy
- [ ] Khi NV cấy xác nhận → trừ tồn kho sáng

### 2.7 Bàn giao thành phẩm → kho thành phẩm (KHO_MO)
- [ ] Trang `/transfers/finished` — danh sách lô thành phẩm đủ tuổi
- [ ] Hệ thống đề xuất lô đến hạn (enteredAt + lightRoomWeeksMax)
- [ ] Tạo phiếu bàn giao sang kho thành phẩm
- [ ] API cập nhật Lot status → TRANSFERRED, chuyển warehouse

### 2.8 Tồn kho
- [ ] Trang `/inventory/kho-sang` — tồn kho sáng theo kệ/lô
- [ ] Trang `/inventory/all` — tổng hợp tất cả kho (DIEU_PHOI, ADMIN)
- [ ] Filter theo loại cây, stage, trạng thái lô
- [ ] Hiển thị lô sắp hết hạn (màu cam/đỏ)

### 2.9 Môi trường (MOI_TRUONG)
- [ ] Trang `/medium/tasks` — tổng hợp mã môi trường theo chỉ định cấy tuần này
- [ ] Phiếu bàn giao nhận môi trường

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
