import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getOrchidOrderFormData } from "@/lib/orchid/queries";
import { OrchidPageHeader } from "@/components/orchid/shared";
import OrchidOrderForm from "../order-form";

export default async function NewOrchidOrderPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requireOrchidStaffPage();
  const { customerId } = await searchParams;
  const data = await getOrchidOrderFormData();
  const preset = customerId ? data.customers.find((c) => c.id === customerId) : undefined;
  return (
    <div className="space-y-4">
      <OrchidPageHeader title="Tạo đơn hàng" description="Lưu nháp để sửa tiếp, hoặc xác nhận luôn để giữ tồn kho" />
      <OrchidOrderForm
        {...data}
        initial={
          preset
            ? { customerId: preset.id, shippingAddress: preset.address ?? "", phone: preset.phone ?? "", note: "", internalNote: "", needInvoice: false, vatRate: 0, items: [] }
            : undefined
        }
      />
    </div>
  );
}
