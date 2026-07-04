# TODO — Xanh Xanh

## Phase 2 — Luồng sản xuất & kho mô

### 2.1 Quản lý loại cây & môi trường (Admin)
- [x] Trang `/plant-types` — danh sách, thêm/sửa loại cây
- [x] Trang `/medium-types` — danh sách, thêm/sửa môi trường
- [x] Cài đặt hệ thống `/settings` — dark_room_days, contamination_alert_pct, default_hold_days
- [x] Tách 2 cấp Loại cây/Chi tiết loại cây (2026-07-03): model mới `PlantCategory` (mã 2-3 chữ cái, VD
      MT/AL/PD) là nhóm cha; `PlantType` (giữ nguyên tên bảng + toàn bộ FK cũ — Lot/Shelf/PlantingInstruction/
      PlantTypeSpec không đổi gì) giờ là "chi tiết loại cây" cụ thể, có `categoryId` + `seq` (1-999, tự tăng
      trong từng Loại cây) + `code` tự sinh = category.code + seq 3 chữ số (VD "MT001"). API mới
      `/api/plant-categories`; `/api/plant-types` đổi sang nhận `categoryId` thay vì `code` tự nhập. 8 loại
      cây demo cũ (AL/MT/PD/AT/HM/EP/MS/RH) đã migrate thành 8 Loại cây + mỗi Loại cây có sẵn 1 Chi tiết
      (seq=1, VD "MT001"), giữ nguyên toàn bộ Lot/Shelf/PlantingInstruction đang trỏ tới (không đổi id, chỉ
      đổi code từ "MT" → "MT001").
- [x] Đổi giao diện `/plant-types` sang 1 bảng phẳng duy nhất (2026-07-03, thay bản trước đó dạng cây mở
      rộng theo từng Loại cây): ô tìm kiếm ở đầu trang lọc theo mã/tên chi tiết/mã+tên Loại cây (lọc phía
      client, không gọi API); dải "chip" Loại cây phía trên bảng (mỗi chip có nút sửa tên + nút "Thêm loại
      cây") để quản lý cấp Loại cây tách biệt khỏi bảng chi tiết chính. Dialog "Thêm chi tiết loại cây" giờ
      có ô chọn Loại cây (trước đây ngầm định theo card đang mở). Bổ sung 51 chi tiết loại cây demo mới
      (tổng 59) trải đều 8 Loại cây hiện có, dùng tên giống cây thật thuộc đúng chi (VD Monstera Deliciosa,
      Philodendron Pink Princess, Anthurium Crystallinum...) — áp dụng qua script một lần vào DB dev đang
      chạy (không đụng dữ liệu khác) + cùng dữ liệu đã đưa vào `seed.ts` cho lần cài đặt sạch sau này.
- [x] Đổi mã quy cách mẫu mẹ M3/M5 → M03/M05 (khớp định dạng 3 ký tự với T01/T05) — đổi toàn bộ
      label/enum/zod trong code + migrate dữ liệu cũ trong DB (Lot, PlantingInstructionItem, PlantTypeSpec).
- [x] Giàn kệ (`/warehouses`) giờ hiện cả mã cây lẫn tên chi tiết loại cây (trước chỉ hiện mã) trên mỗi
      thẻ kệ ở Phòng mẫu mẹ, VD "AL001 — Alocasia".
- [x] Đổi tên + đơn giản hóa 2 field thời gian trên chi tiết loại cây (2026-07-03): `lightRoomWeeksMin/Max`
      ("Thời gian kho sáng", khoảng tuần) → `transferWaitWeeks` ("Thời gian đợi cấy chuyển", 1 số tuần cố
      định); `finishedDaysMin/Max` ("Thời gian thành phẩm", khoảng ngày) → `rootingWeeks` ("Thời gian ra rễ",
      1 số tuần cố định — đổi luôn đơn vị từ ngày sang tuần). Không còn khái niệm tối thiểu/tối đa, chỉ 1 mức
      Admin cài cố định. `POST /api/daily-records` tính `Lot.expectedMoveAt` dùng `addWeeks` cho cả 2 giai
      đoạn (trước đây THANH_PHAM dùng `addDays`).

### 2.2 Chỉ định cấy (KY_THUAT)
- [x] Trang `/instructions` — danh sách chỉ định, filter theo tuần/trạng thái
- [x] Form tạo chỉ định cấy (thiết kế lại 2026-07-03 — 1 kệ có thể có nhiều quy cách nguồn cùng lúc):
  - Chọn **giàn kệ nguồn** (không chọn loại cây riêng — loại cây tự suy ra từ kệ, vì mỗi kệ chỉ xếp 1 loại cây)
  - Hệ thống tự liệt kê **từng dòng quy cách** (M3/M5) đang có trên kệ đó kèm số lượng còn lại
  - Mỗi dòng nhập số lượng dùng riêng + tỉ lệ nhân mẫu mẹ/tỉ lệ ra thành phẩm riêng + **2 môi trường riêng** (1 để nhân thêm mẫu mẹ, 1 để ra rễ thành cây thành phẩm) — **KY_THUAT tự nhập tay hoàn toàn theo tình trạng kiểm tra thực tế của từng lô** (2026-07-03: bỏ cơ chế tự điền theo cấu hình mặc định của loại cây, xem 2.1b). Không còn ô "Môi trường" chung cho cả chỉ định.
  - Output tính **độc lập theo từng dòng** (không dây chuyền): mẫu mẹ dự kiến = số dùng × tỉ lệ nhân; thành phẩm dự kiến = số dùng × tỉ lệ ra TP — rồi cộng dồn tất cả các dòng
  - KY_THUAT nhập kế hoạch phân bổ thành phẩm dự kiến theo quy cách đóng gói T01/T05 (đối chiếu sau này, không bắt buộc khớp tuyệt đối)
- [x] In phiếu chỉ định cấy (print CSS) — trang chi tiết có thêm bảng "Quy cách nguồn" liệt kê từng dòng M3/M5 đã dùng kèm 2 môi trường
- [x] API `POST /api/instructions` — tạo chỉ định nhiều dòng quy cách (mỗi dòng 2 môi trường riêng), tự sinh code
- [x] Trang `/mother-ready` — "Mẫu mẹ đến tuổi cấy chuyển" (2026-07-04): danh sách lô mẫu mẹ trong Kho sáng
      đã tới hoặc quá `Lot.expectedMoveAt` (tính từ `transferWaitWeeks` của chi tiết loại cây). Lọc theo
      **tuần** (khớp lịch tuần làm việc `weekStartsOn: 1` dùng chung toàn app) thay vì mốc số ngày cố định —
      bộ điều hướng Trước/Sau + nút "Tuần này" đổi ô tuần đang chọn (hiện rõ "từ ngày – đến ngày"), có nút
      "Lọc" riêng để áp dụng (đổi tuần không tự lọc lại danh sách ngay), mặc định load lần đầu = tuần hiện
      tại. Cảnh báo tự động: `ensureMotherReadyAlerts()`
      (`src/lib/mother-ready.ts`) tạo `Alert` loại `MOTHER_LOT_READY` cho KY_THUAT khi phát hiện lô mới quá hạn,
      dedupe theo `(type, relatedId)` — không có cron trong app, hàm này chạy lồng vào
      `(dashboard)/layout.tsx` mỗi lần KY_THUAT tải trang bất kỳ (checkpoint gần-thời-gian-thực thay vì lịch cố định).
      **Tiện thể sửa 1 lỗi có sẵn phát hiện khi thêm mục menu này**: `(dashboard)/layout.tsx` lọc menu cho vai trò
      không phải Admin theo kiểu "phải có dòng `RolePermission.enabled=true` mới hiện" (fail-closed) — trái ngược
      `isPageAllowed()` (fail-open, mặc định cho phép nếu chưa cấu hình). Hậu quả: mọi trang thêm vào `ROLE_NAV`
      sau đợt seed ma trận phân quyền ban đầu đều không tự hiện trong menu (kể cả `/medium/receive` thêm hôm
      trước) cho tới khi Admin bật tay từng ô. Sửa lại theo đúng fail-open (chỉ ẩn khi có dòng `enabled=false`
      rõ ràng) — khớp với cách `/users` matrix hiển thị mặc định (`state.get(key) ?? true`).

### 2.1b Quy cách nhân giống theo loại cây (Admin) — ĐÃ BỎ (2026-07-03)
- [x] ~~Model `PlantTypeSpec` — tỉ lệ nhân mẫu mẹ/tỉ lệ ra thành phẩm + 2 môi trường riêng mặc định theo loại cây~~
      **Đã xóa hoàn toàn** (model, API `/api/plant-type-specs`, nút cấu hình trên `/plant-types`) theo yêu cầu:
      quy cách nhân giống là quyết định của KY_THUAT dựa trên tình trạng kiểm tra thực tế từng lô, không phải
      cấu hình mặc định Admin đặt sẵn theo loại cây. Form tạo chỉ định cấy (2.2) giờ để trống tỉ lệ/môi trường,
      KY_THUAT tự nhập tay từng lần.
- [x] Trang `/medium/tasks` (MOI_TRUONG) viết lại để gộp nhiệm vụ pha môi trường theo từng dòng quy cách nguồn (không còn theo 1 môi trường chung/chỉ định) — 1 chỉ định có thể sinh nhiệm vụ cho nhiều mã môi trường khác nhau

### 2.3 Nhập dữ liệu cấy hàng ngày (CAY_MO)
- [x] Trang `/my-instructions` — xem chỉ định được giao
- [x] Trang `/daily-record` — form nhập dữ liệu hàng ngày (nhiều dòng, mỗi dòng tự chọn quy cách):
  - Số mẫu mẹ đã dùng (motherUsed)
  - Mỗi dòng sản lượng chọn giai đoạn (Mẫu mẹ/Thành phẩm) + quy cách tương ứng (M3/M5 cho mẫu mẹ — chỉ hiện quy cách chỉ định đã dùng làm nguồn; T01/T05 cho thành phẩm) + số lượng — lô mới tạo ra mang đúng quy cách NV chọn
  - Tự động trừ tồn mẫu mẹ nguồn — _chưa làm, thiếu field liên kết lô mẫu mẹ nguồn trên DailyRecord/PlantingInstruction, cần thiết kế schema riêng_
- [x] Cảnh báo lệch output so với chỉ định (>20%)
- [x] API `POST /api/daily-records` — tạo nhật ký, nhận quy cách (stageCode) theo từng dòng từ NV thay vì suy từ chỉ định, cập nhật Lot
- [x] Đổi định dạng mã lô (2026-07-04): mã lô = **mã chi tiết loại cây** (VD "AL001") + **mã NV cấy 3 số**
      (3 số cuối `User.code`, VD "NV003" → "003") + **mã tuần/năm 4 số** (VD "2726" = tuần 27 năm 2026,
      tính theo lịch tuần `weekStartsOn: 1` dùng chung toàn app) — ghép liền không dấu gạch, VD
      "AL0010032726". **Nhiều dòng Lot khác quy cách (VD M03 và M05 của cùng 1 đợt cấy — cùng loại cây,
      cùng NV, cùng tuần) dùng chung đúng 1 mã lô này**, vẫn là 2 bản ghi Lot riêng (số lượng/tồn kho tính
      riêng theo từng quy cách như cũ, không gộp số) — chỉ đính chung mã để NV nhìn biết cùng 1 đợt cấy.
      `Lot.code` không còn `@unique` riêng lẻ, đổi thành `@@unique([code, stageCode])`; nếu (mã lô, quy
      cách) đã tồn tại rồi (VD lô cũ cùng tuần đã chuyển kệ, giờ tạo lô mới cùng NV/loại cây/quy cách) thì
      tự thêm hậu tố "-2", "-3"... để tránh trùng. `generateLotCode()` trong `src/lib/codes.ts` viết lại
      theo tổ hợp mới; các nơi tạo Lot khác (tách lô do tràn sức chứa kệ ở `PATCH /api/transfers/[id]`,
      seed demo) cũng cập nhật theo. Kiểm thử qua API thật: 2 lô M03/M05 cùng 1 chỉ định ra đúng 1 mã;
      DB từ chối đúng khi tạo trùng cả (mã, quy cách).

### 2.4 Lọc nhiễm (CAY_MO)
- [x] Trang `/my-dark-room` — xem phòng tối cá nhân
- [x] Form báo cáo nhiễm: chọn Lot, nhập số lượng nhiễm
- [x] API `POST /api/contamination` — tạo record, trừ tồn Lot

### 2.5 Bàn giao phòng tối → kho sáng (KHO_MO)
- [x] Trang `/transfers/receive` — danh sách bàn giao chờ xác nhận
- [x] Xác nhận nhận cây từ phòng tối
- [x] Hệ thống gợi ý vị trí kệ trống trong kho sáng — sửa lại 2026-07-03: dropdown chọn kệ giờ tự lọc
      theo đúng nguyên tắc kệ Phòng mẫu mẹ (xem 2.13), trước đó chỉ liệt kê tất cả kệ trong phòng không lọc gì
- [x] API `PATCH /api/transfers/[id]` (action confirm) kiểm tra khớp loại cây + không vượt capacity trước khi cam kết
- [x] Xác nhận sắp xếp → cập nhật shelfId của Lot, cộng tồn kho sáng
- [x] API `POST /api/transfers` — tạo phiếu bàn giao
- [x] API `PATCH /api/transfers/[id]` — xác nhận/từ chối bàn giao

### 2.6 Bàn giao mẫu mẹ cho NV cấy (KHO_MO)
- [x] Trang `/transfers/send` — chọn chỉ định, chọn lô mẫu mẹ theo QR kệ
- [x] Tạo phiếu bàn giao cho NV cấy
- [x] Khi NV cấy xác nhận → trừ tồn kho sáng

### 2.7 Bàn giao thành phẩm → kho thành phẩm (KHO_MO)
- [x] Trang `/transfers/finished` — danh sách lô thành phẩm đủ tuổi
- [x] Hệ thống đề xuất lô đến hạn (dựa trên `Lot.expectedMoveAt`, tính từ `enteredAt` + `rootingWeeks` của chi tiết loại cây lúc lô được tạo)
- [x] Tạo phiếu bàn giao sang kho thành phẩm
- [x] API cập nhật Lot status → TRANSFERRED, chuyển warehouse

### 2.8 Tồn kho
- [x] Trang `/inventory/kho-sang` — tồn kho sáng theo kệ/lô
- [x] Trang `/inventory/all` — tổng hợp tất cả kho (DIEU_PHOI, ADMIN)
- [x] Filter theo loại cây, stage, trạng thái lô
- [x] Hiển thị lô sắp hết hạn (màu cam/đỏ)

### 2.9 Môi trường (MOI_TRUONG)
- [x] Trang `/medium/tasks` — tổng hợp mã môi trường theo chỉ định cấy tuần này
- [x] Phiếu bàn giao nhận môi trường (2026-07-03): model `MediumHandover`/`MediumHandoverItem` riêng
      (không dùng chung `Transfer` vì môi trường không gắn Lot/kệ/kho). Trên `/medium/tasks`, MOI_TRUONG
      tick chọn từng dòng nhiệm vụ (chỉ chọn được dòng đã có NV cấy phụ trách) rồi bấm "Tạo phiếu bàn giao"
      — tự động gộp theo từng NV nếu chọn nhiều NV cùng lúc, tạo 1 phiếu/NV. API
      `POST /api/medium-handovers` (chỉ MOI_TRUONG), `PATCH /api/medium-handovers/[id]` (confirm/reject,
      chỉ đúng NV cấy được chỉ định nhận). Trang `/medium/receive` (CAY_MO) xác nhận nhận, gửi kèm
      `Alert` loại `MEDIUM_HANDOVER_READY`. Kiểm thử qua API thật (login MOI_TRUONG → tạo phiếu → login
      CAY_MO → thấy phiếu + alert → xác nhận → phiếu chuyển CONFIRMED).

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
- [x] Rà soát các trang tồn kho/báo cáo còn lọc theo `Warehouse.type` cũ (2026-07-05): các trang
      `/warehouses`, `/transfers/*`, `/instructions`, `shelf-assignment.ts` đều đã đúng, lọc theo
      `Room.type` chi tiết chứ không dừng ở `Warehouse.type` thô. Phát hiện 1 lỗi thật: **trang
      `/inventory/thanh-pham` được liệt kê trong menu KHO_THANH_PHAM (và TODO đánh dấu xong từ trước)
      nhưng chưa từng được tạo — bấm vào ra lỗi 404.** Đã viết trang này (theo đúng mẫu `/inventory/kho-sang`,
      liệt kê tồn theo từng Phòng khả dụng/theo dõi/hạn túi/thị trường + tổng hợp theo loại cây). Cũng xóa
      luôn tham số `warehouseType` chết trong `GET /api/lots` (không còn nơi nào gọi, sót lại từ trước khi
      tách Room — mọi nơi đã chuyển sang dùng `roomType`).

### 2.13 Nguyên tắc kệ Kho sáng — tách Phòng mẫu mẹ / Phòng ra rễ (Admin, SUPER_ADMIN)
- [x] Đổi `RoomType`: bỏ `PHONG_SANG` (dùng chung), tách thành `PHONG_MAU_ME` (kệ mẫu mẹ) và `PHONG_RA_RE` (kệ cây ra rễ) — mỗi kho sản xuất có cả 2 phòng này. Migrate dữ liệu cũ (2 phòng "Phòng sáng A/B") sang `PHONG_MAU_ME`, giữ nguyên toàn bộ kệ/lô đã có; tạo mới 2 phòng "Phòng ra rễ A/B" (15 kệ mỗi phòng, trống, không ràng buộc).
- [x] Kệ Phòng mẫu mẹ: `Shelf.plantTypeId` (1 kệ chỉ xếp 1 mã cây) + `Shelf.assignedStaffId` (1 kệ gắn 1 nhân viên cấy mô — chỉ chọn được user role CAY_MO) + capacity mặc định **1800 cụm mẫu mẹ** (không phải 360 túi như bản đầu). **Chỉ SUPER_ADMIN** được cấu hình 2 field này (API `PATCH /api/shelves/[id]` trả 403 nếu không phải SUPER_ADMIN) — Admin thường không thấy 2 ô này trên `/warehouses`. Không cho đổi mã cây khi kệ đang còn lô ACTIVE của loại cây khác (409).
- [x] Quy đổi số lượng túi mẫu mẹ sang số cụm khi tính sức chứa: 1 túi M3 = 3 cụm, 1 túi M5 = 5 cụm (`motherClusterUnits()` trong `src/types/index.ts`, dùng chung ở `/warehouses`, `/inventory/kho-sang`, `PATCH /api/transfers/[id]` action confirm, và `transfers/receive`). VD: 100 túi M03 + 100 túi M05 = 100×3 + 100×5 = 800 cụm.
- [x] Kệ Phòng ra rễ: không ràng buộc gì (không mã cây, không nhân viên, không capacity mặc định).
- [x] Admin (không cần SUPER_ADMIN) chuyển được 1 kệ giữa Phòng mẫu mẹ ↔ Phòng ra rễ (ô "Chuyển phòng…" trên `/warehouses`, cùng kho) qua `PATCH /api/shelves/[id]` với `roomId` — rời khỏi Phòng mẫu mẹ thì tự xóa mã cây/nhân viên đã gán.
- [x] **Chỉ định cấy chỉ được chọn kệ thuộc Phòng mẫu mẹ** (trước đây là "Phòng sáng" nói chung) — lọc ở dropdown + chặn cứng ở `POST /api/instructions`.
- [x] `PATCH /api/transfers/[id]` action confirm vẫn kiểm tra khớp mã cây + đủ chỗ khi xếp lô vào kệ Phòng mẫu mẹ (không áp dụng cho Phòng ra rễ, vì kệ đó không có mã cây để so).
- [x] Xóa `getSuggestedShelves` (hàm cũ trong `src/lib/inventory.ts`, không được gọi ở đâu, tính capacity sai kiểu số lô) — thay bằng lọc trực tiếp trong `/api/transfers/[id]` GET + `transfers/receive` UI
- [x] UI tạo phiếu bàn giao "phòng tối → kho sáng" — CAY_MO chọn lô trên `/my-dark-room` (checkbox từng lô + "Chọn tất cả") rồi bấm "Bàn giao cho Kho mô", gọi `POST /api/transfers` không cần chọn kho/phòng/kệ đích (hệ thống tự suy ra kho nguồn từ kệ chỉ định cấy đã tạo ra lô, kể cả khi lô chưa được xếp kệ nào — `shelfId: null`). Tạo `Alert` loại `LOT_READY_TRANSFER` gửi tới toàn bộ `targetRole: KHO_MO`. Sửa `GET /api/transfers` để mọi KHO_MO (không riêng người tạo/được chỉ định) đều thấy phiếu chưa có `toUserId` cụ thể từ Phòng tối trên `/transfers/receive`. Kiểm thử qua API thật (tạo lô bằng `daily-records`, gửi bàn giao, xác nhận là KHO_MO) — đúng cả 2 bước xếp kệ tự động ở 2.14.

### 2.14 Tự động chỉ định kệ khi KHO_MO nhận bàn giao từ Phòng tối → Kho sáng
- [x] Trong Phòng mẫu mẹ, UI `/warehouses` tự chia hiển thị 2 nhóm kệ: **Kho mẫu mẹ đã chia** (kệ đã gán `assignedStaffId`) và **Kho mẫu mẹ chung** (kệ chưa gán) — nhóm suy ra từ field có sẵn, không phải Room riêng (`shelf-list.tsx`).
- [x] `src/lib/shelf-assignment.ts` (`planShelfAssignments`) — khi `PATCH /api/transfers/[id]` action `confirm` phát hiện nguồn là Phòng tối (`fromRoom.type === PHONG_TOI`), hệ thống **tự chỉ định kệ hoàn toàn**, bỏ qua `shelfAssignments` do client gửi (nếu có):
  - Cây ra rễ (THANH_PHAM) → kệ Phòng ra rễ đang dùng ít nhất trong cùng kho.
  - Mẫu mẹ (MAU_ME, M3/M5) → đúng kệ của NV phụ trách (Kho mẫu mẹ đã chia: `assignedStaffId` = NV được giao chỉ định cấy tạo ra lô, đúng mã cây). Nếu vượt sức chứa còn lại (1800 cụm) trên kệ đó, phần dư (tính theo túi, không cắt lẻ cụm) được **tách thành 1 lô con mới** (`parentLotId` trỏ về lô gốc) xếp vào kệ Kho mẫu mẹ chung còn nhiều chỗ nhất, cùng mã cây — không cần KHO_MO chọn tay.
  - Không tìm được kệ phù hợp (VD: NV chưa được SUPER_ADMIN gán kệ, hoặc Kho mẫu mẹ chung không đủ chỗ) → trả lỗi 409 rõ nguyên nhân thay vì âm thầm xếp sai.
- [x] `transfers/receive` UI: khi phiếu có nguồn là Phòng tối, ẩn hết dropdown chọn kệ thủ công, chỉ hiện ghi chú + danh sách lô, nút "Xác nhận nhận hàng" gọi API không kèm `shelfAssignments`; sau khi xác nhận hiện toast tóm tắt kệ đã xếp cho từng lô (kèm lô nào bị tách do tràn). Các loại phiếu bàn giao khác (không phải từ Phòng tối) vẫn chọn kệ thủ công như cũ, không đổi hành vi.
- [x] Kiểm thử qua API thật: lô mẫu mẹ 400 túi M5 (kệ NV còn trống 1676 cụm) → tự tách 335 túi vào kệ NV, 65 túi (lô con mới) vào Kho mẫu mẹ chung; lô thành phẩm 50 túi T01 → tự vào kệ Phòng ra rễ đang trống nhất. Xác nhận đúng dữ liệu DB sau khi chạy.

### 2.15 Giao diện `/warehouses` dạng cây thu gọn 3 cấp Kho → Phòng → Kệ (Admin, SUPER_ADMIN)
- [x] Đổi giao diện chính từ hiện hết mọi kho/phòng/kệ 1 lần thành **3 cấp thu gọn**: mặc định chỉ
      hiện danh sách Kho (Kho sản xuất/Kho thành phẩm), bấm "Xem thêm" mới hiện các Phòng trong kho đó
      (vẫn thu gọn), bấm tiếp "Xem chi tiết" trên 1 phòng mới hiện bảng kệ của phòng đó. Tách thành
      `warehouse-board.tsx` (client, quản lý state 2 cấp `expandedWarehouses`/`expandedRooms` bằng
      `Set<string>`) — `page.tsx` chỉ còn fetch dữ liệu rồi render component này.
- [x] Đổi hiển thị thông tin kệ từ dạng thẻ lưới (`shelf-list.tsx`, đã xóa) sang **bảng ngang**
      (`shelf-table.tsx` mới) — giữ nguyên toàn bộ tính năng cũ: nút xem QR + in QR, chọn nhân viên phụ
      trách, tách 2 bảng "Kho mẫu mẹ đã chia"/"Kho mẫu mẹ chung", thanh tiến trình tồn/sức chứa, dropdown
      chuyển kệ sang phòng khác.
- [x] Phát hiện + sửa lỗi hiển thị cũ (đã có từ trước, không phải lỗi mới): 2 dropdown "Loại cây" và
      "NV phụ trách" hiện ID thô (VD `cmr55uewt00009cvv5wxb1cbf`) thay vì tên, do `SelectValue` không
      truyền children dạng hàm — cùng nguyên nhân đã sửa ở Checklist settings trước đây.
- [x] Theo yêu cầu, đổi cột "Loại cây" (dropdown gán `Shelf.plantTypeId`) thành cột chữ **"Tên cây chi
      tiết"** chỉ hiển thị, không sửa được nữa trên trang này — **vẫn giữ nguyên field
      `Shelf.plantTypeId` trong DB** (field này là đầu vào bắt buộc của `planShelfAssignments()` trong
      `shelf-assignment.ts` để tự xếp lô mẫu mẹ vào đúng kệ, không được xóa). Đổi tên cột "NV phụ trách"
      → "Nhân viên phụ trách", sửa lỗi hiện ID thô ở trên bằng `SelectValue` dạng hàm. Thêm cột mới
      "Số túi M03/M05" — cộng `quantity` các lô ACTIVE trên kệ theo từng `stageCode`.
      **Lưu ý:** vì không còn nơi nào trên UI chỉnh `Shelf.plantTypeId` nữa (trước đây chỉ có ở đây), nếu
      sau này cần đổi mã cây gán cho 1 kệ, phải bổ sung 1 nơi khác để chỉnh (VD: dialog riêng, hoặc màn
      quản lý nhân viên phụ trách kệ).
- [x] Kiểm thử qua trình duyệt thật (Playwright, cài tạm rồi gỡ sau khi xong): xác nhận đúng cả 3 cấp
      thu gọn/mở rộng, bảng kệ hiện đúng cột mới + tên cây/tên nhân viên thay vì ID thô.

### 2.16 Sửa dữ liệu nháp: mã lô đúng định dạng mới + tên cây "001" không trùng Loại cây
- [x] Phát hiện: `prisma/seed.ts` chưa từng thực sự áp dụng định dạng mã lô mới (mã cây + mã NV cấy +
      mã tuần/năm) từ lần đổi trước (commit `7514dea`) — chỉ có `where` của upsert đổi sang khóa kép
      `code_stageCode`, còn giá trị `code` sinh ra vẫn ở dạng cũ (`${pt.code}${sc.code}` VD "AL001M03",
      hoặc `SEED-LOT-...` ở khối lịch sử demo). Viết lại cả 2 khối tạo lô nháp trong seed.ts theo đúng
      công thức `lotCodeBase()` (giống `generateLotCode()` thật): mã chi tiết loại cây + 3 số cuối mã NV
      cấy + mã tuần/năm 4 số. M03/M05/T01/T05 của cùng 1 đợt (cùng cây, cùng NV, cùng tuần) dùng chung
      1 mã lô, phân biệt bằng `stageCode` — đúng nguyên tắc "chỉ định cấy phân bổ theo tuần" đã làm ở 2.x.
      Khối lịch sử demo trước đây tạo 3 lô mẫu mẹ + 3 lô thành phẩm riêng biệt mỗi tuần/NV (mỗi ngày 1 lô,
      trái nguyên tắc gộp theo tuần) — sửa thành gộp theo `stageCode` trong cùng tuần/chỉ định (ngày sau
      cộng dồn `quantity`/`initialQuantity` vào lô ngày đầu thay vì tạo lô mới), thêm `uniqueLotCode()`
      tự thêm hậu tố "-2" khi 2 khối dữ liệu nháp (tồn hiện tại + lịch sử) vô tình trùng mã.
- [x] Phát hiện thêm: 8 mã cây "seq=1" của mỗi Loại cây (VD "AL001") trước đây lấy tên trùng luôn tên
      Loại cây ("Alocasia") — dễ nhầm giữa cột "Loại cây" (chi) và "Tên cây chi tiết" (giống cụ thể) khi
      xem `/warehouses`. Đổi tên 8 mã này thành giống cụ thể khác (VD AL001 "Alocasia" → "Alocasia
      Odora"), giữ nguyên toàn bộ các mã 002-008 khác không đổi. `plantType.upsert` đổi từ `update: {}`
      (không cập nhật) sang `update: { name: names[i] }` để lần seed lại thực sự đổi tên cho các dòng cũ.
- [x] Xóa sạch dữ liệu nháp cũ (Lot, DailyRecord/Item, PlantingInstruction, ContaminationRecord, Transfer,
      Order, MediumHandover, Alert — dùng script tạm `reset-drafts.ts`, đã xóa sau khi chạy xong) rồi seed
      lại toàn bộ theo yêu cầu — vì mã cũ không khớp khóa mới nên không thể "sửa tại chỗ", phải làm mới.
      Kho/phòng/kệ/danh sách cây/người dùng giữ nguyên, không bị xóa.
- [x] Kiểm tra qua script tạm sau khi seed: mã lô mẫu `AL0010032726` (= AL001 + NV003 + tuần 27/2026),
      M03/M05/T01/T05 cùng 1 mã đúng như thiết kế; toàn bộ 8 mã "001" hết trùng tên Loại cây; tổng 396 lô,
      59 loại cây (giữ đúng số lượng dòng như trước khi đổi công thức, chỉ đổi giá trị `code`/tên).

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
- [x] Checklist đầu việc hàng ngày per role (2026-07-03): model `ChecklistTemplate` (Admin soạn sẵn đầu
      việc cố định theo vai trò, trang `/settings`) + `ChecklistItem` (1 dòng/NV/ngày, sinh tự động —
      `ensureTodayChecklist` trong `src/lib/checklist.ts`) + `ChecklistThreshold` (ngưỡng % tối thiểu/ngày
      theo vai trò, Admin cấu hình). Widget "Việc cần làm hôm nay" trên mọi biến thể `/dashboard`, mỗi đầu
      việc 1 checkbox riêng. Việc chưa hoàn thành **không sinh dòng mới** cho ngày sau — vẫn cùng 1 dòng,
      tự động hiện tiếp ở checklist "hôm nay" tới khi tích xong (không nhân bản). Báo cáo Admin ở tab
      "Checklist" trong `/reports` — chọn ngày, xem % hoàn thành từng NV, tô đỏ + badge "Không đạt" nếu
      dưới ngưỡng vai trò đó. Kiểm thử qua API thật: tạo template + ngưỡng, NV hoàn thành 1/3 việc, báo
      cáo đúng 33% dưới ngưỡng 90%; giả lập sang ngày mới (backdate `assignedDate`) xác nhận không sinh
      trùng dòng và báo cáo theo ngày cũ vẫn giữ đúng số liệu ngày đó (0/2, dưới ngưỡng).
- [ ] In phiếu bàn giao (print CSS)
