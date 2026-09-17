import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { differenceInCalendarDays } from "date-fns";
import { isNearExpiry } from "@/lib/report-utils";

// warehouseId (tuỳ chọn) — thu hẹp xuống ĐÚNG 1 kho sản xuất, dùng cho trang riêng
// /reports/inventory-lifecycle (NV Kỹ thuật/Kho mô chỉ xem đúng cơ sở mình làm việc, xem page.tsx ở đó).
// Bỏ trống (mặc định) = xem toàn hệ thống, giữ nguyên hành vi cũ cho tab "Quá hạn" của Admin ở /reports.
// 1 lô chỉ có ĐÚNG 1 trong 2 (shelf ở kho sản xuất, room ở kho thành phẩm) nên lọc OR cả hai.
export default async function InventoryLifecycleReport({ warehouseId = null }: { warehouseId?: string | null } = {}) {
  const warehouseFilter = warehouseId ? { OR: [{ shelf: { warehouseId } }, { room: { warehouseId } }] } : {};

  const activeLots = await prisma.lot.findMany({
    where: { status: "ACTIVE", ...warehouseFilter },
    select: {
      code: true,
      stage: true,
      quantity: true,
      enteredAt: true,
      expectedMoveAt: true,
      plantType: { select: { name: true } },
      // shelf = lô ở kho sản xuất (Phòng mẫu mẹ/Phòng ra rễ, xếp theo giàn kệ). room = lô ở kho thành
      // phẩm (không quản lý theo giàn kệ, gắn thẳng vào phòng) — 1 lô chỉ có ĐÚNG 1 trong 2, dùng cả 2 để
      // ghép ra "đang nằm ở khu vực nào" bên dưới.
      shelf: { select: { code: true, room: { select: { warehouse: { select: { code: true, name: true } } } } } },
      room: { select: { name: true, warehouse: { select: { code: true, name: true } } } },
      // Chỉ cần biết CÓ đang gắn với 1 chỉ định cấy còn hiệu lực hay không (xem isPendingTransfer bên
      // dưới) — không cần chi tiết gì thêm ngoài status.
      instructionItems: { select: { instruction: { select: { status: true } } } },
    },
  });

  // Danh sách sắp/quá hạn — gồm CẢ Mẫu mẹ (KY_THUAT ra chỉ định cấy chuyển) lẫn Thành phẩm (Kho mô
  // chuyển kho thành phẩm), phân biệt bằng cột "Giai đoạn" vì cùng 1 danh sách trộn cả 2. Loại lô
  // quantity = 0 — lô đã dùng hết (tách túi/chuyển hết/xuất hết đơn) nhưng status vẫn ACTIVE theo đúng quy
  // ước "không xoá bản ghi Lot, chỉ đưa quantity về 0" của toàn hệ thống (xem POST /api/data-import/lots)
  // — vỏ rỗng này không còn gì để chuyển giai đoạn nên hiện "quá hạn" ở đây là vô nghĩa, chỉ gây nhiễu.
  //
  // QUAN TRỌNG: expectedMoveAt được set 1 LẦN lúc lô sinh ra (đến hạn ra rễ tại Phòng ra rễ, hoặc đến hạn
  // cấy chuyển mẫu mẹ tại Phòng mẫu mẹ) và KHÔNG BAO GIỜ được xoá/cập nhật lại sau khi lô đã thực sự
  // chuyển giai đoạn xong — nên nếu chỉ lọc theo expectedMoveAt, lô ĐÃ chuyển xong từ lâu (thành phẩm đã
  // nằm trong Kho thành phẩm, mẫu mẹ đã được gán vào 1 chỉ định cấy mới) vẫn hiện "quá hạn" MÃI MÃI dù đã
  // xử lý xong — đây chính là điều anh hỏi ("sao thành phẩm đã ở Kho thành phẩm Đông Dư vẫn quá hạn").
  // Phải lọc thêm isPendingTransfer để chỉ giữ lại lô THẬT SỰ còn chờ xử lý, khớp đúng điều kiện đã dùng ở
  // ensureRootingReadyAlerts (src/lib/rooting-ready.ts, shelfId != null = còn ở Phòng ra rễ) và
  // /instructions (mother-due, chưa gắn chỉ định ACTIVE/DRAFT nào).
  const isPendingTransfer = (lot: (typeof activeLots)[number]) => {
    if (lot.stage === "THANH_PHAM") return !!lot.shelf; // còn ở Phòng ra rễ — chưa chuyển Kho thành phẩm
    return !lot.instructionItems.some((it) => it.instruction.status === "ACTIVE" || it.instruction.status === "DRAFT");
  };
  const nearExpiryLots = activeLots
    .filter((l) => l.quantity > 0 && isNearExpiry(l.expectedMoveAt) && isPendingTransfer(l))
    .sort((a, b) => (a.expectedMoveAt?.getTime() ?? 0) - (b.expectedMoveAt?.getTime() ?? 0));
  const overdueMotherQuantity = nearExpiryLots
    .filter((l) => l.stage === "MAU_ME" && l.expectedMoveAt && differenceInCalendarDays(l.expectedMoveAt, new Date()) < 0)
    .reduce((sum, l) => sum + l.quantity, 0);
  const overdueFinishedQuantity = nearExpiryLots
    .filter((l) => l.stage === "THANH_PHAM" && l.expectedMoveAt && differenceInCalendarDays(l.expectedMoveAt, new Date()) < 0)
    .reduce((sum, l) => sum + l.quantity, 0);

  // "Đang nằm ở khu vực nào" — kho sản xuất (có shelf) hiện Kho + mã giàn kệ, kho thành phẩm (chỉ có
  // room, không qua giàn kệ) hiện Kho + tên phòng.
  const locationLabel = (lot: (typeof nearExpiryLots)[number]) => {
    if (lot.shelf) return `${lot.shelf.room?.warehouse.name ?? "?"} — Kệ ${lot.shelf.code}`;
    if (lot.room) return `${lot.room.warehouse.name} — ${lot.room.name}`;
    return "—";
  };
  // Tách riêng Mẫu mẹ/Thành phẩm thành 2 bảng xếp chồng (mẫu mẹ trên, thành phẩm dưới) thay vì trộn chung
  // 1 bảng — 2 giai đoạn này do 2 vai trò khác nhau xử lý (KY_THUAT ra chỉ định cấy chuyển / Kho mô
  // chuyển kho thành phẩm) nên tách ra gọn/dễ nhìn hơn, đỡ phải dò cột "Giai đoạn" giữa 1 danh sách dài.
  const motherLots = nearExpiryLots.filter((l) => l.stage === "MAU_ME");
  const finishedLots = nearExpiryLots.filter((l) => l.stage === "THANH_PHAM");
  const displayedMotherLots = motherLots.slice(0, 15);
  const displayedFinishedLots = finishedLots.slice(0, 15);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lô sắp/quá hạn chuyển giai đoạn</CardTitle>
          <p className="text-sm text-text-secondary">Còn ≤3 ngày hoặc đã quá hạn dự kiến chuyển giai đoạn</p>
        </CardHeader>
        <CardContent className="p-0">
          {nearExpiryLots.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-6">Không có lô nào sắp/quá hạn</p>
          ) : (
            <div className="divide-y divide-divider">
              <div className="p-4">
                <h3 className="font-bold text-primary-strong mb-2">Mẫu mẹ — chờ cấy chuyển</h3>
                {overdueMotherQuantity > 0 && (
                  <p className="text-sm bg-danger-light text-destructive rounded-md px-3 py-2 mb-3">
                    <strong>{overdueMotherQuantity.toLocaleString("vi-VN")} cụm</strong> đã quá hạn cấy chuyển (chưa ra chỉ định cấy)
                  </p>
                )}
                <StageLotTable lots={displayedMotherLots} totalCount={motherLots.length} locationLabel={locationLabel} />
              </div>
              <div className="p-4">
                <h3 className="font-bold text-primary-strong mb-2">Thành phẩm — chờ chuyển kho</h3>
                {overdueFinishedQuantity > 0 && (
                  <p className="text-sm bg-danger-light text-destructive rounded-md px-3 py-2 mb-3">
                    <strong>{overdueFinishedQuantity.toLocaleString("vi-VN")} cây</strong> đã quá hạn chuyển kho thành phẩm
                  </p>
                )}
                <StageLotTable lots={displayedFinishedLots} totalCount={finishedLots.length} locationLabel={locationLabel} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Dùng chung cho cả 2 bảng Mẫu mẹ/Thành phẩm ở "Lô sắp/quá hạn chuyển giai đoạn" — bỏ cột "Giai đoạn" (đã
// tách riêng theo bảng nên không cần lặp lại nữa).
function StageLotTable<T extends { code: string; quantity: number; expectedMoveAt: Date | null; plantType: { name: string } }>({
  lots, totalCount, locationLabel,
}: {
  lots: T[];
  totalCount: number;
  locationLabel: (lot: T) => string;
}) {
  if (lots.length === 0) {
    return <p className="text-sm text-text-muted text-center py-6">Không có lô nào sắp/quá hạn</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light">
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã lô</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Loại cây</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Khu vực</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Số lượng</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => {
            const daysLeft = lot.expectedMoveAt ? differenceInCalendarDays(lot.expectedMoveAt, new Date()) : null;
            const overdue = daysLeft !== null && daysLeft < 0;
            return (
              <tr key={lot.code} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                <td className="px-3 py-2 font-mono">{lot.code}</td>
                <td className="px-3 py-2">{lot.plantType.name}</td>
                <td className="px-3 py-2 text-text-secondary">{locationLabel(lot)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{lot.quantity.toLocaleString("vi-VN")}</td>
                <td className="px-3 py-2 text-right">
                  <Badge className={overdue ? "bg-danger-light text-destructive" : "bg-warning-light text-warning-foreground"}>
                    {overdue ? `Quá hạn ${Math.abs(daysLeft!)} ngày` : `Còn ${daysLeft} ngày`}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalCount > lots.length && (
        <p className="text-xs text-text-muted text-center py-2">
          Hiển thị {lots.length}/{totalCount} lô gần hạn nhất
        </p>
      )}
    </div>
  );
}
