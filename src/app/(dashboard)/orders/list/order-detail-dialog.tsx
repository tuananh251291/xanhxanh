"use client";

import Link from "next/link";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Printer } from "lucide-react";
import { MARKET_LABELS, ORDER_STATUS_LABELS } from "@/types";
import OrderDetailContent, { type OrderDetailItem } from "@/components/shared/order-detail-content";

export default function OrderDetailDialog({
  id, code, customerCode, market, status, holdUntilLabel, createdAtLabel, notes, items,
}: {
  id: string;
  code: string;
  customerCode: string;
  market: keyof typeof MARKET_LABELS;
  status: keyof typeof ORDER_STATUS_LABELS;
  holdUntilLabel: string;
  createdAtLabel: string;
  notes: string | null;
  items: OrderDetailItem[];
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-8" />}>
        <Eye className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
      </DialogTrigger>
      <DialogContent className="w-fit sm:max-w-none max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="font-mono">{code}</DialogTitle>
            <Link href={`/orders/${id}`} target="_blank">
              <Button size="sm" variant="outline" className="h-8">
                <Printer className="w-3.5 h-3.5 mr-1.5" /> In phiếu
              </Button>
            </Link>
          </div>
        </DialogHeader>

        <OrderDetailContent
          customerCode={customerCode}
          market={market}
          status={status}
          holdUntilLabel={holdUntilLabel}
          createdAtLabel={createdAtLabel}
          notes={notes}
          items={items}
        />
      </DialogContent>
    </Dialog>
  );
}
