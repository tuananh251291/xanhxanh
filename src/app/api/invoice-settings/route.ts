import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canCreateInvoice, canEditInvoiceSettings, canEditUsShipments, getInvoiceSettings, saveInvoiceSettings } from "@/lib/invoice";
import { mergeInvoiceSettings } from "@/lib/invoice-engine";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  const canEdit = canEditInvoiceSettings(session.user.role);
  const canShip = await canEditUsShipments(session.user);
  if (!canEdit && !canShip && !canCreateInvoice(session.user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ settings: await getInvoiceSettings(), canEdit, canEditShipments: canShip });
}

const shipmentsSchema = z.array(z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày chuyến không hợp lệ"),
  kg: z.union([z.literal(45), z.literal(100), z.literal(200), z.literal(300)]),
})).max(30);

// PUT { settings } — Admin cấp cao lưu toàn bộ. PUT { shipments } — NV Quản lý thị trường Mỹ chỉ sửa lịch chuyến.
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body && Array.isArray(body.shipments)) {
    if (!(await canEditUsShipments(session.user))) return NextResponse.json({ message: "Chỉ NV Quản lý thị trường Mỹ / Admin cấp cao sửa lịch chuyến" }, { status: 403 });
    const p = shipmentsSchema.safeParse(body.shipments);
    if (!p.success) return NextResponse.json({ message: p.error.issues[0]?.message ?? "Lịch chuyến không hợp lệ" }, { status: 400 });
    const s = await getInvoiceSettings();
    s.us.shipments = [...p.data].sort((a, b) => a.date.localeCompare(b.date));
    await saveInvoiceSettings(s);
    return NextResponse.json({ success: true });
  }
  if (!canEditInvoiceSettings(session.user.role)) return NextResponse.json({ message: "Chỉ Admin cấp cao sửa cài đặt invoice" }, { status: 403 });
  if (!body?.settings || typeof body.settings !== "object") return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  // Lịch chuyến Mỹ chỉ sửa qua PUT { shipments } — giữ bản hiện tại, tránh ghi đè sửa song song của NV Quản lý.
  const merged = mergeInvoiceSettings(body.settings);
  merged.us.shipments = (await getInvoiceSettings()).us.shipments;
  await saveInvoiceSettings(merged);
  return NextResponse.json({ success: true });
}
