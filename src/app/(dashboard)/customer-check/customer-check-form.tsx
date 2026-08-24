"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, AlertTriangle, UserPlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CUSTOMER_STATUS_LABELS } from "@/types";
import { validateWebsite, hasWebsitePath, WEBSITE_MAX_LENGTH } from "@/lib/customer";

type Market = { id: string; code: string; name: string };
type MatchResult = {
  id: string; name: string; website: string;
  market: { code: string; name: string };
  status: "CHUA_PHAN_CONG" | "DA_PHAN_CONG" | "MAC_DINH";
  assignedTo: { id: string; code: string; name: string } | null;
  manager: { id: string; code: string; name: string } | null;
};

// Cần đơn giản hoá kiểm tra email — chỉ báo lỗi rõ ràng khi rõ ràng sai định dạng, không chặn hết các
// trường hợp hợp lệ hiếm gặp (server vẫn validate lại đầy đủ bằng zod .email()).
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

export default function CustomerCheckForm() {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [match, setMatch] = useState<MatchResult | null>(null);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registering, setRegistering] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [createForm, setCreateForm] = useState({ marketId: "", email: "", phone: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (createOpen && markets.length === 0) {
      fetch("/api/markets").then((r) => r.json()).then((d) => setMarkets(Array.isArray(d) ? d.filter((m: Market & { isActive?: boolean }) => (m as { isActive?: boolean }).isActive !== false) : []));
    }
  }, [createOpen, markets.length]);

  const check = async () => {
    if (!name.trim()) { toast.error("Nhập Tên khách hàng - công ty"); return; }
    if (!website.trim() && !phone.trim() && !email.trim()) {
      toast.error("Cần nhập ít nhất Website, Số điện thoại hoặc Email");
      return;
    }
    if (website.trim()) {
      const websiteError = validateWebsite(website);
      if (websiteError) { toast.error(websiteError); return; }
    }
    if (email.trim() && !EMAIL_REGEX.test(email.trim())) { toast.error("Email không hợp lệ"); return; }
    setChecking(true);
    setChecked(false);
    try {
      const res = await fetch("/api/customer-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), website: website.trim(), phone: phone.trim(), email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      setMatch(json.match);
      setChecked(true);
      if (json.match && json.match.status === "CHUA_PHAN_CONG") setRegisterOpen(true);
    } finally {
      setChecking(false);
    }
  };

  const doRegister = async () => {
    if (!match) return;
    setRegistering(true);
    try {
      const res = await fetch("/api/customer-check/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: match.id }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); setRegisterOpen(false); setChecked(false); return; }
      toast.success("Đã đăng ký phụ trách khách hàng này");
      setRegisterOpen(false);
      setChecked(false);
      setName(""); setWebsite(""); setPhone(""); setEmail("");
    } finally {
      setRegistering(false);
    }
  };

  // Kế thừa Email/SĐT đã nhập ở bước Kiểm tra — NV không phải gõ lại, vẫn sửa được nếu cần.
  const openCreate = () => {
    setCreateForm((p) => ({ ...p, email: p.email || email, phone: p.phone || phone }));
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!createForm.marketId) {
      toast.error("Chọn Thị trường");
      return;
    }
    if (!website.trim() && !createForm.phone.trim() && !createForm.email.trim()) {
      toast.error("Cần nhập ít nhất Website, Số điện thoại hoặc Email");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/customer-check/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), website: website.trim(), ...createForm }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã tạo khách hàng mới và đăng ký phụ trách");
      setCreateOpen(false);
      setChecked(false);
      setName(""); setWebsite(""); setPhone(""); setEmail("");
      setCreateForm({ marketId: "", email: "", phone: "" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm">Tên khách hàng - công ty</Label>
              <Input value={name} onChange={(e) => { setName(e.target.value); setChecked(false); }} placeholder="VD: ABC Import Export Co., Ltd" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Website</Label>
              <Input
                value={website}
                onChange={(e) => { setWebsite(e.target.value); setChecked(false); }}
                placeholder="VD: abc-import.com"
                maxLength={WEBSITE_MAX_LENGTH - 1}
              />
              <p className="text-xs text-text-muted">
                Chỉ nhập link trang chủ, không gắn đường dẫn phụ (VD: /aboutus, /shop)
              </p>
              {website.trim() && hasWebsitePath(website) && (
                <p className="text-xs text-warning-foreground flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Link này có vẻ là trang con, hãy kiểm tra lại và chỉ nhập link trang chủ
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Số điện thoại</Label>
              <Input value={phone} onChange={(e) => { setPhone(e.target.value); setChecked(false); }} placeholder="VD: 0901234567" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Email</Label>
              <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setChecked(false); }} placeholder="VD: contact@abc-import.com" />
            </div>
          </div>
          <p className="text-xs text-text-muted">Cần nhập ít nhất 1 trong 3: Website, Số điện thoại hoặc Email.</p>
          <Button onClick={check} disabled={checking} className="bg-primary hover:bg-primary-hover">
            {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Kiểm tra
          </Button>

          {checked && match && match.status !== "CHUA_PHAN_CONG" && (
            <div className="flex items-start gap-2 bg-danger-light rounded-lg px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Khách này đã có người phụ trách</p>
                <p className="text-text-secondary mt-0.5">
                  {match.name} ({match.website}) — thị trường {match.market.name}, trạng thái {CUSTOMER_STATUS_LABELS[match.status]}, do{" "}
                  <span className="font-medium text-foreground">{match.assignedTo?.name} ({match.assignedTo?.code})</span> phụ trách.
                </p>
              </div>
            </div>
          )}

          {checked && !match && (
            <div className="flex items-start gap-2 bg-info-light rounded-lg px-4 py-3">
              <Sparkles className="w-5 h-5 text-info-foreground shrink-0 mt-0.5" />
              <div className="text-sm flex-1">
                <p className="font-medium text-info-foreground">Khách này chưa tồn tại</p>
                <p className="text-text-secondary mt-0.5">Bạn hãy tạo thông tin khách hàng và đăng ký phụ trách nhé.</p>
                <Button size="sm" className="mt-2 bg-primary hover:bg-primary-hover" onClick={openCreate}>
                  <UserPlus className="w-4 h-4 mr-1.5" /> Tiếp tục
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Đăng ký phụ trách khách hàng</DialogTitle></DialogHeader>
          <p className="text-sm text-text-secondary">
            Khách <span className="font-medium text-foreground">{match?.name}</span> hiện đang &quot;Chưa phân công&quot;.
            Bạn có thể đăng ký phụ trách khách này, bạn có muốn đăng ký không?
          </p>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { setRegisterOpen(false); setChecked(false); }}>Không</Button>
            <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={registering} onClick={doRegister}>
              {registering && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Có
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Tạo khách hàng mới</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="space-y-1">
              <Label className="text-sm">Tên khách hàng - công ty</Label>
              <Input value={name} disabled />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Website</Label>
              <Input value={website || "(chưa có)"} disabled />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Thị trường *</Label>
              <Select
                items={markets.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))}
                value={createForm.marketId}
                onValueChange={(v) => setCreateForm((p) => ({ ...p, marketId: v as string }))}
              >
                <SelectTrigger><SelectValue placeholder="Chọn thị trường" /></SelectTrigger>
                <SelectContent>
                  {markets.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Email</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Số điện thoại</Label>
              <Input value={createForm.phone} onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <p className="text-xs text-text-muted">Cần có ít nhất 1 trong 3: Website, Số điện thoại hoặc Email.</p>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Hủy</Button>
              <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={creating} onClick={submitCreate}>
                {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Đăng ký phụ trách
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
