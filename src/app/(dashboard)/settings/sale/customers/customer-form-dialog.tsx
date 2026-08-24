"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CUSTOMER_STATUS_LABELS, CUSTOMER_GROUP_LABELS } from "@/types";

type Market = { id: string; code: string; name: string };
type User = { id: string; code: string; name: string; role: string };
type CustomerStatus = "CHUA_PHAN_CONG" | "DA_PHAN_CONG" | "MAC_DINH";
type CustomerGroup = "KHACH_SI_NHO" | "KHACH_CONG_TY" | "KHACH_CONG_TY_LON";
const CUSTOMER_GROUP_NONE = "NONE";
type Customer = {
  id: string; code: string; name: string; website: string; marketId: string; email: string | null; phone: string | null;
  status: CustomerStatus;
  customerGroup: CustomerGroup | null;
  firstContactAt: string; lastOrderAt: string | null; lastOrderCode: string | null; assignedToId: string | null;
};

// Đã phân công + Mặc định đều cần Nhân viên phụ trách — chỉ Chưa phân công mới để trống.
const REQUIRES_ASSIGNEE = new Set<CustomerStatus>(["DA_PHAN_CONG", "MAC_DINH"]);

export default function CustomerFormDialog({
  markets, saleUsers, customer, onSaved,
}: {
  markets: Market[];
  saleUsers: User[];
  customer?: Customer;
  onSaved: () => void;
}) {
  const isEdit = !!customer;
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "", website: "", marketId: "", email: "", phone: "",
    status: "CHUA_PHAN_CONG" as CustomerStatus,
    customerGroup: CUSTOMER_GROUP_NONE as CustomerGroup | typeof CUSTOMER_GROUP_NONE,
    firstContactAt: format(new Date(), "yyyy-MM-dd"),
    lastOrderAt: "", lastOrderCode: "", assignedToId: "",
  });

  useEffect(() => {
    if (!open) return;
    if (customer) {
      setForm({
        name: customer.name, website: customer.website, marketId: customer.marketId,
        email: customer.email ?? "", phone: customer.phone ?? "", status: customer.status,
        customerGroup: customer.customerGroup ?? CUSTOMER_GROUP_NONE,
        firstContactAt: format(new Date(customer.firstContactAt), "yyyy-MM-dd"),
        lastOrderAt: customer.lastOrderAt ? format(new Date(customer.lastOrderAt), "yyyy-MM-dd") : "",
        lastOrderCode: customer.lastOrderCode ?? "",
        assignedToId: customer.assignedToId ?? "",
      });
    } else {
      setForm({
        name: "", website: "", marketId: markets[0]?.id ?? "", email: "", phone: "",
        status: "CHUA_PHAN_CONG", customerGroup: CUSTOMER_GROUP_NONE,
        firstContactAt: format(new Date(), "yyyy-MM-dd"),
        lastOrderAt: "", lastOrderCode: "", assignedToId: "",
      });
    }
  }, [open, customer, markets]);

  const submit = async () => {
    if (!form.name.trim() || !form.website.trim() || !form.marketId || !form.email.trim() || !form.phone.trim() || !form.firstContactAt) {
      toast.error("Điền đầy đủ các trường bắt buộc");
      return;
    }
    if (REQUIRES_ASSIGNEE.has(form.status) && !form.assignedToId) {
      toast.error("Trạng thái này cần chọn Nhân viên phụ trách");
      return;
    }
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/customers/${customer!.id}` : "/api/customers";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          website: form.website.trim(),
          marketId: form.marketId,
          email: form.email.trim(),
          phone: form.phone.trim(),
          status: form.status,
          customerGroup: form.customerGroup === CUSTOMER_GROUP_NONE ? null : form.customerGroup,
          firstContactAt: form.firstContactAt,
          lastOrderAt: form.lastOrderAt || null,
          lastOrderCode: form.lastOrderCode.trim() || null,
          assignedToId: REQUIRES_ASSIGNEE.has(form.status) ? form.assignedToId : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(isEdit ? "Đã cập nhật khách hàng" : "Đã tạo khách hàng mới");
      setOpen(false);
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={isEdit
          ? <Button size="sm" variant="ghost" />
          : <Button className="bg-primary hover:bg-primary-hover" />}
      >
        {isEdit ? <Pencil className="w-3.5 h-3.5 text-text-muted" /> : <><Plus className="w-4 h-4 mr-1.5" /> Thêm khách hàng</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Sửa khách hàng" : "Thêm khách hàng mới"}</DialogTitle></DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label className="text-sm">Tên khách hàng - công ty *</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-sm">Website *</Label>
              <Input value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Thị trường *</Label>
              <Select
                items={markets.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))}
                value={form.marketId}
                onValueChange={(v) => setForm((p) => ({ ...p, marketId: v as string }))}
              >
                <SelectTrigger><SelectValue placeholder="Chọn thị trường" /></SelectTrigger>
                <SelectContent>
                  {markets.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Trạng thái *</Label>
              <Select
                items={Object.entries(CUSTOMER_STATUS_LABELS).map(([v, label]) => ({ value: v, label }))}
                value={form.status}
                onValueChange={(v) => setForm((p) => ({ ...p, status: v as CustomerStatus }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHUA_PHAN_CONG">{CUSTOMER_STATUS_LABELS.CHUA_PHAN_CONG}</SelectItem>
                  <SelectItem value="DA_PHAN_CONG">{CUSTOMER_STATUS_LABELS.DA_PHAN_CONG}</SelectItem>
                  <SelectItem value="MAC_DINH">{CUSTOMER_STATUS_LABELS.MAC_DINH}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Nhóm khách hàng</Label>
              <Select
                items={[{ value: CUSTOMER_GROUP_NONE, label: "Chưa phân loại" }, ...Object.entries(CUSTOMER_GROUP_LABELS).map(([v, label]) => ({ value: v, label }))]}
                value={form.customerGroup}
                onValueChange={(v) => setForm((p) => ({ ...p, customerGroup: v as CustomerGroup | typeof CUSTOMER_GROUP_NONE }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CUSTOMER_GROUP_NONE}>Chưa phân loại</SelectItem>
                  <SelectItem value="KHACH_SI_NHO">{CUSTOMER_GROUP_LABELS.KHACH_SI_NHO}</SelectItem>
                  <SelectItem value="KHACH_CONG_TY">{CUSTOMER_GROUP_LABELS.KHACH_CONG_TY}</SelectItem>
                  <SelectItem value="KHACH_CONG_TY_LON">{CUSTOMER_GROUP_LABELS.KHACH_CONG_TY_LON}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-text-muted">Khách công ty lớn được giữ đơn 5 tháng thay vì theo Năng lực giữ đơn của NV Sale.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Số điện thoại *</Label>
              <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            {REQUIRES_ASSIGNEE.has(form.status) && (
              <div className="space-y-1 col-span-2">
                <Label className="text-sm">Nhân viên phụ trách *</Label>
                <Select
                  items={saleUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
                  value={form.assignedToId}
                  onValueChange={(v) => setForm((p) => ({ ...p, assignedToId: v as string }))}
                >
                  <SelectTrigger><SelectValue placeholder="Chọn NV bán hàng" /></SelectTrigger>
                  <SelectContent>
                    {saleUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} ({u.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-sm">Ngày đầu tiếp cận *</Label>
              <Input type="date" value={form.firstContactAt} onChange={(e) => setForm((p) => ({ ...p, firstContactAt: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Ngày ra đơn gần nhất</Label>
              <Input type="date" value={form.lastOrderAt} onChange={(e) => setForm((p) => ({ ...p, lastOrderAt: e.target.value }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-sm">Mã đơn gần nhất</Label>
              <Input value={form.lastOrderCode} onChange={(e) => setForm((p) => ({ ...p, lastOrderCode: e.target.value }))} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Lưu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
