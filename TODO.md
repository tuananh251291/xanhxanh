# TODO — Xanh Xanh

## Phase 2 — Luồng sản xuất & kho mô

### 2.1 Quản lý loại cây & môi trường (Admin)
- [x] Trang `/plant-types` — danh sách, thêm/sửa loại cây
- [x] Trang `/medium-types` — danh sách, thêm/sửa môi trường
- [x] Cài đặt hệ thống `/settings` — dark_room_days, contamination_alert_pct, default_hold_days

### 2.2 Chỉ định cấy (KY_THUAT)
- [x] Trang `/instructions` — danh sách chỉ định, filter theo tuần/trạng thái
- [x] Form tạo chỉ định cấy (thiết kế lại 2026-07-03 — 1 kệ có thể có nhiều quy cách nguồn cùng lúc):
  - Chọn **giàn kệ nguồn** (không chọn loại cây riêng — loại cây tự suy ra từ kệ, vì mỗi kệ chỉ xếp 1 loại cây)
  - Hệ thống tự liệt kê **từng dòng quy cách** (M3/M5) đang có trên kệ đó kèm số lượng còn lại
  - Mỗi dòng nhập số lượng dùng riêng + tỉ lệ nhân mẫu mẹ/tỉ lệ ra thành phẩm riêng + **2 môi trường riêng** (1 để nhân thêm mẫu mẹ, 1 để ra rễ thành cây thành phẩm) — tự điền theo cấu hình quy cách của loại cây (xem 2.1b), sửa tay được. Không còn ô "Môi trường" chung cho cả chỉ định.
  - Output tính **độc lập theo từng dòng** (không dây chuyền): mẫu mẹ dự kiến = số dùng × tỉ lệ nhân; thành phẩm dự kiến = số dùng × tỉ lệ ra TP — rồi cộng dồn tất cả các dòng
  - KY_THUAT nhập kế hoạch phân bổ thành phẩm dự kiến theo quy cách đóng gói T01/T05 (đối chiếu sau này, không bắt buộc khớp tuyệt đối)
- [x] In phiếu chỉ định cấy (print CSS) — trang chi tiết có thêm bảng "Quy cách nguồn" liệt kê từng dòng M3/M5 đã dùng kèm 2 môi trường
- [x] API `POST /api/instructions` — tạo chỉ định nhiều dòng quy cách (mỗi dòng 2 môi trường riêng), tự sinh code

### 2.1b Quy cách nhân giống theo loại cây (Admin)
- [x] Model `PlantTypeSpec` — tỉ lệ nhân mẫu mẹ/tỉ lệ ra thành phẩm + **2 môi trường riêng** (nhân mẫu mẹ / ra rễ thành phẩm) mặc định, cấu hình riêng cho M3 và M5 của từng loại cây
- [x] Nút cấu hình trên `/plant-types` (`plant-type-spec-dialog.tsx`) + API `/api/plant-type-specs`
- [x] Trang `/medium/tasks` (MOI_TRUONG) viết lại để gộp nhiệm vụ pha môi trường theo từng dòng quy cách nguồn (không còn theo 1 môi trường chung/chỉ định) — 1 chỉ định có thể sinh nhiệm vụ cho nhiều mã môi trường khác nhau

### 2.3 Nhập dữ liệu cấy hàng ngày (CAY_MO)
- [x] Trang `/my-instructions` — xem chỉ định được giao
- [x] Trang `/daily-record` — form nhập dữ liệu hàng ngày (nhiều dòng, mỗi dòng tự chọn quy cách):
  - Số mẫu mẹ đã dùng (motherUsed)
  - Mỗi dòng sản lượng chọn giai đoạn (Mẫu mẹ/Thành phẩm) + quy cách tương ứng (M3/M5 cho mẫu mẹ — chỉ hiện quy cách chỉ định đã dùng làm nguồn; T01/T05 cho thành phẩm) + số lượng — lô mới tạo ra mang đúng quy cách NV chọn
  - Tự động trừ tồn mẫu mẹ nguồn — _chưa làm, thiếu field liên kết lô mẫu mẹ nguồn trên DailyRecord/PlantingInstruction, cần thiết kế schema riêng_
- [x] Cảnh báo lệch output so với chỉ định (>20%)
- [x] API `POST /api/daily-records` — tạo nhật ký, nhận quy cách (stageCode) theo từng dòng từ NV thay vì suy từ chỉ định, cập nhật Lot

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
- [x] `/reports` (ADMIN, KY_THUAT) — trang tab gộp 4 báo cáo (sản lượng, tỉ lệ nhiễm, kế hoạch vs thực tế, tồn kho & vòng đời), có biểu đồ. Không tách route riêng `/reports/production` — dùng tab trong cùng 1 trang.
- [x] `/alerts` — danh sách cảnh báo cơ bản + badge số chưa đọc trên sidebar

### 2.11 Đăng ký & duyệt tài khoản, phân quyền theo vai trò (Admin)
- [x] Trang `/register` — nhân viên tự đăng ký, tài khoản mới ở trạng thái PENDING (chưa có vai trò)
- [x] Màn hình chặn truy cập cho tài khoản PENDING/REJECTED (`pending-status-screen.tsx`) — hiện ở mọi trang dashboard cho tới khi được duyệt
- [x] Danh sách "Tài khoản chờ duyệt" trên `/users` — Admin chọn vai trò rồi Duyệt, hoặc Từ chối
- [x] API `PATCH /api/users/[id]` — duyệt (gán role) / từ chối, chỉ SUPER_ADMIN được gọi
- [x] Ma trận phân quyền trên `/users` — Admin bật/tắt quyền truy cập từng trang cho từng vai trò (trừ ADMIN — luôn full quyền)
- [x] API `/api/permissions` + `src/lib/permissions.ts` (`isPageAllowed`) — kiểm tra quyền theo role+href, mặc định cho phép nếu chưa cấu hình (fail-open)
- [x] Session tự làm mới role/status/isActive từ DB mỗi request (không cần đăng xuất/đăng nhập lại khi Admin duyệt/đổi quyền/khóa tài khoản)

### 2.12 Cơ cấu Kho → Phòng → Kệ, phân quyền "Phòng thị trường" (Admin)
- [x] Đổi cấu trúc: `Warehouse` (Sản xuất | Thành phẩm) → `Room` (6 loại: Phòng sáng/Phòng tối cho sản xuất; Phòng khả dụng/Phòng theo dõi/Phòng hạn túi/Phòng thị trường cho thành phẩm) → `Shelf`
- [x] Dialog thêm "Phòng thị trường" trên `/warehouses` (`add-market-room-dialog.tsx`)
- [x] Dialog gán quyền xem theo từng Phòng thị trường cho nhân viên SALE (`room-access-dialog.tsx`) + API `/api/rooms/[id]/access`
- [ ] Rà soát các trang tồn kho/báo cáo còn lọc theo `Warehouse.type` cũ xem đã cập nhật hết sang Room chưa — _chưa rà soát kỹ, cần kiểm tra riêng_

---

## Phase 3 — Bán hàng & kho thành phẩm

- [ ] Trang `/inventory/available` — tồn khả dụng (SALE xem)
- [ ] Trang `/orders` — tạo/quản lý đơn hàng
- [ ] Logic holdUntil: tự động cancel khi quá hạn
- [ ] Trang `/orders/pack` — sắp đơn đã xác nhận (KHO_THANH_PHAM)
- [ ] Kiểm tồn cuối tháng

---

## Phase 4 — Dashboard nâng cao & tiện ích

- [x] Biểu đồ sản lượng theo tuần/tháng — trong `/reports` tab "Sản lượng"
- [x] Biểu đồ tỉ lệ nhiễm theo NV cấy — trong `/reports` tab "Tỉ lệ nhiễm"
- [ ] Báo cáo hiệu suất NV (xuất Excel) — có biểu đồ trong `/reports` rồi, còn thiếu phần xuất Excel
- [ ] QR scan bằng camera điện thoại (html5-qrcode)
- [ ] Realtime alerts (Supabase Realtime)
- [ ] Checklist đầu việc hàng ngày per role
- [ ] In phiếu bàn giao (print CSS)
