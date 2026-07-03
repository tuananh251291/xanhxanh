@AGENTS.md

# Xanh Xanh — Hệ thống quản lý nuôi cấy mô, kho & bán hàng

## Tổng quan dự án

Phần mềm ERP chuyên ngành cho doanh nghiệp nuôi cấy mô cây giống. Quản lý toàn bộ chu trình:
**Cấy mô → Phòng tối → Kho sáng → Kho thành phẩm → Bán hàng**

## Stack

| Layer | Công nghệ |
|---|---|
| Framework | Next.js 16 (App Router, `src/` directory) |
| Language | TypeScript |
| Database | PostgreSQL (Supabase) qua `@prisma/adapter-pg` |
| ORM | Prisma 7 (dùng `prisma.config.ts`, không có URL trong schema.prisma) |
| Auth | NextAuth v5 beta (JWT strategy) |
| UI | Tailwind CSS v4 + shadcn/ui (dùng `@base-ui/react`, không phải Radix) |
| Validation | Zod + react-hook-form |
| Notifications | Sonner (toast) |
| QR | qrcode (gen) + html5-qrcode (scan) |

## Lưu ý quan trọng — Đọc trước khi code

- **Next.js 16**: dùng `src/proxy.ts` thay vì `middleware.ts` (đã deprecated)
- **Prisma 7**: LUÔN truyền adapter: `new PrismaClient({ adapter })` — xem `src/lib/prisma.ts`
- **shadcn DialogTrigger**: KHÔNG có prop `asChild` (khác Radix UI)
- **NextAuth tách đôi**: `auth.config.ts` = Edge-safe (proxy.ts dùng), `auth.ts` = full với Prisma
- **DATABASE_URL**: transaction pooler port 6543 | **DIRECT_URL**: port 5432 (migrations/seed)
- **Prisma config**: datasource URL đặt trong `prisma.config.ts`, không trong `schema.prisma`

## Cấu trúc thư mục

```
src/
├── app/
│   ├── (auth)/login/          # Trang đăng nhập
│   ├── (dashboard)/           # Layout chính có sidebar
│   │   ├── layout.tsx         # Server component, kiểm tra auth
│   │   ├── dashboard/         # Tổng quan (khác nhau theo role)
│   │   ├── users/             # Quản lý người dùng (Admin)
│   │   ├── plant-types/       # Loại cây (Admin)
│   │   ├── warehouses/        # Kho & kệ + QR code (Admin)
│   │   ├── medium-types/      # Loại môi trường (Admin)
│   │   ├── instructions/      # Chỉ định cấy (KY_THUAT/CAY_MO)
│   │   ├── daily-record/      # Nhập dữ liệu cấy (CAY_MO)
│   │   ├── inventory/         # Tồn kho (nhiều role)
│   │   ├── transfers/         # Phiếu bàn giao
│   │   ├── orders/            # Đơn hàng (SALE/KHO_THANH_PHAM)
│   │   ├── alerts/            # Cảnh báo
│   │   └── settings/          # Cài đặt (Admin)
│   └── api/
│       ├── auth/[...nextauth]/
│       ├── users/
│       └── warehouses/
├── components/
│   ├── layout/sidebar.tsx     # Sidebar co giãn được, menu theo role
│   ├── shared/qr-code-display.tsx
│   └── ui/                    # shadcn components
├── lib/
│   ├── prisma.ts              # Prisma singleton với PrismaPg adapter
│   ├── auth.ts                # NextAuth full (Node.js, có Prisma)
│   └── auth.config.ts         # NextAuth Edge-safe (không import Prisma)
├── types/index.ts             # Labels, colors, ROLE_NAV cho sidebar
└── proxy.ts                   # Auth proxy (Edge, dùng auth.config.ts)
```

## Database — 20 bảng chính

```
users, role_permissions, system_configs
plant_types, medium_types, plant_type_specs (tỉ lệ nhân/môi trường mặc định theo quy cách M3/M5 của từng loại cây)
warehouses, rooms, room_access, shelves
lots (đơn vị tồn kho, có stage MAU_ME/THANH_PHAM, parentLotId, stageCode = quy cách M3/M5/T01/T05)
planting_instructions, planting_instruction_items (mỗi dòng = 1 quy cách nguồn dùng trong chỉ định, có ratio + expected riêng)
daily_records, daily_record_items
contamination_records
transfers, transfer_items
orders, order_items
alerts
```

## Luồng vận hành

```
[KY_THUAT] Tạo chỉ định cấy
    ↓
[KHO_MO] Bàn giao mẫu mẹ cho CAY_MO
    ↓
[CAY_MO] Nhập dữ liệu cấy hàng ngày → tạo Lot mới
    ↓
[CAY_MO] Bàn giao → phòng tối (7 ngày, Transfer PENDING)
    ↓
[KHO_MO] Xác nhận nhận → chuyển lên kho sáng (hệ thống gợi ý kệ)
    ↓
[Hệ thống] Sau 4-6 tuần: mẫu mẹ → cấy lại, thành phẩm → kho TP
    ↓
[KHO_THANH_PHAM] Nhận, phân loại đạt/không đạt
    ↓
[SALE] Tạo đơn giữ → xác nhận → KHO_THANH_PHAM xuất
```

## Quy tắc tồn kho

- **Tồn khả dụng** = tồn thực − tổng số lượng trong đơn HELD
- Đơn HELD: trừ tồn khả dụng (không trừ thực)
- Đơn CONFIRMED: trừ tồn thực
- Đơn quá hạn holdUntil: tự động CANCELLED, hoàn tồn khả dụng

## Tài khoản demo

| Role | Email | Pass |
|---|---|---|
| Admin | admin@xanhxanh.vn | admin123 |
| Kỹ thuật | kythuat@xanhxanh.vn | demo123 |
| Cấy mô | caymo1@xanhxanh.vn | demo123 |
| Kho mô | khomo@xanhxanh.vn | demo123 |
| Kho TP | khothanhhpham@xanhxanh.vn | demo123 |
| Sale | sale1@xanhxanh.vn | demo123 |

## Scripts

```bash
npm run dev          # localhost:3000
npm run db:push      # sync schema lên Supabase (dùng DIRECT_URL)
npm run db:seed      # tạo dữ liệu mẫu
npm run db:generate  # regenerate Prisma client sau khi sửa schema.prisma
npm run db:studio    # Prisma Studio
```

## Phase status

- **Phase 1 ✅** — Setup, schema, auth, dashboard, users, warehouses+QR
- **Phase 2 🔄** — Chỉ định cấy, nhập dữ liệu, bàn giao kho (xem TODO.md)
- **Phase 3** — Bán hàng, kho thành phẩm, auto-cancel đơn quá hạn
- **Phase 4** — Charts, báo cáo PDF/Excel, QR scan camera, realtime alerts
