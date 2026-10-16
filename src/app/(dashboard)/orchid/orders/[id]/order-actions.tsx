"use client";

import { useState } from "react";
import Link from "next/link";
import type { OrchidOrderStatus } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea, useOrchidAction } from "@/components/orchid/ui";

const EDITABLE: OrchidOrderStatus[] = ["DRAFT", "PENDING_APPROVAL", "WAITING_CUSTOMER", "CONFIRMED"];
const CANCELLABLE: OrchidOrderStatus[] = ["DRAFT", "PENDING_APPROVAL", "WAITING_CUSTOMER", "CONFIRMED", "PREPARING"];
const RETURNABLE: OrchidOrderStatus[] = ["SHIPPED", "COMPLETED", "PARTIALLY_RETURNED"];

export default function OrderActions({ orderId, status, items }: { orderId: string; status: OrchidOrderStatus; items: { id: string; name: string; quantity: number; returnedQuantity: number }[] }) {
  const { run, pending } = useOrchidAction();
  const act = (body: Record<string, unknown>, msg: string) => run(`/api/orchid/orders/${orderId}`, { method: "PATCH", body }, msg);

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-primary-strong">Thao tác</p>
      {pending && <Loader2 className="w-4 h-4 animate-spin" />}
      {EDITABLE.includes(status) && (
        <Link href={`/orchid/orders/${orderId}/edit`} className="block"><Button variant="outline" className="w-full">Sửa đơn (số lượng, giá, thông tin)</Button></Link>
      )}
      {status === "DRAFT" && <Button className="w-full" disabled={pending} onClick={() => act({ action: "confirm" }, "Đã xác nhận đơn")}>Xác nhận đơn</Button>}
      {status === "PENDING_APPROVAL" && (
        <>
          <Button className="w-full" disabled={pending} onClick={() => act({ action: "confirm" }, "Đã duyệt đơn")}>Duyệt đơn (giữ nguyên)</Button>
          <SendToCustomerDialog onSend={(staffMessage) => act({ action: "send_to_customer", staffMessage }, "Đã gửi lại khách xác nhận")} pending={pending} />
        </>
      )}
      {status === "WAITING_CUSTOMER" && (
        <Button variant="outline" className="w-full" disabled={pending} onClick={() => confirm("Xác nhận thay khách (khách đã đồng ý qua điện thoại/tin nhắn)?") && act({ action: "confirm" }, "Đã xác nhận đơn")}>
          Xác nhận thay khách
        </Button>
      )}
      {status === "CONFIRMED" && (
        <Button className="w-full" disabled={pending} onClick={() => confirm("Xuất kho đơn này? Hệ thống tự trừ tồn theo lô nhập trước – xuất trước.") && act({ action: "prepare" }, "Đã xuất kho")}>
          Xuất kho (trừ tồn theo lô)
        </Button>
      )}
      {status === "PREPARING" && <Button className="w-full" disabled={pending} onClick={() => act({ action: "ship" }, "Đã chuyển sang Đã giao")}>Đã giao hàng</Button>}
      {status === "SHIPPED" && <Button className="w-full" disabled={pending} onClick={() => act({ action: "complete" }, "Đơn đã hoàn thành")}>Hoàn thành đơn</Button>}
      {RETURNABLE.includes(status) && <ReturnDialog items={items} pending={pending} onSubmit={(returns) => act({ action: "return", returns }, "Đã nhận hàng trả lại")} />}
      {CANCELLABLE.includes(status) && (
        <Button
          variant="outline"
          className="w-full text-destructive"
          disabled={pending}
          onClick={() => {
            const reason = prompt(status === "PREPARING" ? "Lý do huỷ (hàng sẽ được hoàn lại đúng lô đã xuất):" : "Lý do huỷ đơn:");
            if (reason !== null) act({ action: "cancel", reason }, "Đã huỷ đơn");
          }}
        >
          Huỷ đơn
        </Button>
      )}
      {!EDITABLE.includes(status) && !CANCELLABLE.includes(status) && !RETURNABLE.includes(status) && status !== "SHIPPED" && (
        <p className="text-sm text-text-muted">Đơn đã kết thúc.</p>
      )}
    </div>
  );
}

function SendToCustomerDialog({ onSend, pending }: { onSend: (msg: string) => Promise<boolean>; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>Gửi lại khách xác nhận</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Gửi lại khách xác nhận</DialogTitle></DialogHeader>
        <p className="text-sm text-text-secondary">Sửa số lượng/giá trước (nút &quot;Sửa đơn&quot;), sau đó gửi để khách đăng nhập xác nhận hoặc từ chối.</p>
        <Textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Lời nhắn cho khách, VD: Hiện chỉ còn 80 cây, em điều chỉnh lại số lượng…" />
        <Button disabled={pending} onClick={async () => { if (await onSend(msg)) setOpen(false); }}>Gửi khách</Button>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ items, onSubmit, pending }: { items: { id: string; name: string; quantity: number; returnedQuantity: number }[]; onSubmit: (r: { itemId: string; quantity: number }[]) => Promise<boolean>; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>Nhận hàng trả lại</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Khách trả hàng</DialogTitle></DialogHeader>
        <p className="text-sm text-text-secondary">Hàng trả được cộng lại vào đúng lô đã xuất, công nợ khách giảm theo giá trị trả (gồm VAT).</p>
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm">{i.name} <span className="text-xs text-text-muted">(còn {i.quantity - i.returnedQuantity})</span></span>
              <Input type="number" min={0} max={i.quantity - i.returnedQuantity} className="w-24" value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
        <Button
          disabled={pending}
          onClick={async () => {
            const returns = Object.entries(qty).filter(([, q]) => q > 0).map(([itemId, quantity]) => ({ itemId, quantity }));
            if (await onSubmit(returns)) { setOpen(false); setQty({}); }
          }}
        >
          Xác nhận trả hàng
        </Button>
      </DialogContent>
    </Dialog>
  );
}
