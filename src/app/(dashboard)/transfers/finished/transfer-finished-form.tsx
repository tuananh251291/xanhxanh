"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, ClipboardList, Search, AlertTriangle, CheckCheck, Sprout, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import Link from "next/link";
import type { RootingGroup } from "./rooting-groups";

export default function TransferFinishedForm({
  rootingGroups = [],
}: {
  rootingGroups?: RootingGroup[];
}) {
  const router = useRouter();
  const dueGroups = useMemo(() => rootingGroups.filter((g) => g.isDue), [rootingGroups]);

  // Nhóm ĐÃ đến hạn → chuyển sang trang review riêng (dễ nhìn hơn bảng dòng), lấy nguyên số lượng từng
  // lô — trang đó tự tra lại dữ liệu kệ theo shelfIds trên URL. Muốn bàn giao sớm hơn lịch (Nhóm CHƯA đến
  // hạn) hoặc nhập số muốn bàn giao riêng từng loại cây/quy cách thì sang trang "Bàn giao sớm theo Nhóm
  // tuần ra rễ" (/transfers/finished/early, xem Card bên dưới).
  const selectDueGroup = (group: RootingGroup) => {
    router.push(`/transfers/finished/review?shelfIds=${group.shelves.map((s) => s.id).join(",")}`);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Package className="w-6 h-6 text-primary-strong" /> Bàn giao thành phẩm
        </h1>
        <p className="text-text-secondary text-sm mt-1">Bàn giao thành phẩm trong Phòng ra rễ sang Kho thành phẩm theo Nhóm tuần ra rễ</p>
      </div>

      {dueGroups.length > 0 && (
        <div className="space-y-3">
          {dueGroups.map((group) => {
            const lotCount = group.shelves.reduce((sum, s) => sum + s.lots.length, 0);
            return (
              <Card key={group.groupId} className="border border-warning-light bg-warning-light">
                <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-warning-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-warning-foreground">
                        Nhóm tuần ra rễ {group.groupName} đã đủ 3 tuần — cần bàn giao sang kho thành phẩm
                      </p>
                      <p className="text-sm text-warning-foreground/80">
                        {group.roomName} ({group.warehouseName}) · {group.shelves.length} kệ · {lotCount} lô
                        {group.oldestEnteredAt && (
                          <> · lô cũ nhất từ {format(new Date(group.oldestEnteredAt), "dd/MM/yyyy", { locale: vi })}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" className="bg-primary hover:bg-primary-hover shrink-0" onClick={() => selectDueGroup(group)}>
                    <CheckCheck className="w-4 h-4 mr-1.5" /> Xem trước & bàn giao cả nhóm
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Link href="/transfers/finished/early">
        <Card className="hover:bg-muted transition-colors cursor-pointer border-info-light">
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Sprout className="w-5 h-5 text-info-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-info-foreground">Bàn giao sớm theo Nhóm tuần ra rễ</p>
                <p className="text-sm text-text-secondary">
                  Chọn 1 kệ bất kỳ (kể cả Nhóm chưa đến hạn) để xem toàn bộ kệ cùng nhóm và tự nhập số muốn bàn giao trước cho từng loại cây/quy cách
                </p>
              </div>
            </div>
            <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover pointer-events-none shrink-0">
              Đi tới <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </Link>

      <Link href="/transfers/finished/list">
        <Card className="hover:bg-muted transition-colors cursor-pointer">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ClipboardList className="w-4 h-4 text-text-muted" /> Danh sách phiếu đã bàn giao
            </span>
            <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover pointer-events-none">
              <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
            </Button>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
