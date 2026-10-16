import { requireOrchidCustomerPage } from "@/lib/orchid/page-guard";
import { getOrchidShopCatalog } from "@/lib/orchid/shop";
import { OrchidPageHeader } from "@/components/orchid/shared";
import NoCustomerLinked from "../no-customer";
import CartView from "./cart-view";

export default async function OrchidCartPage() {
  const { customer } = await requireOrchidCustomerPage();
  if (!customer) return <NoCustomerLinked />;
  const products = await getOrchidShopCatalog(customer.id);
  return (
    <div className="space-y-4">
      <OrchidPageHeader title="Giỏ hàng" description="Gửi đơn để nhân viên duyệt — nếu cần điều chỉnh số lượng, đơn sẽ được gửi lại để bạn xác nhận" />
      <CartView
        products={products}
        defaults={{
          shippingAddress: customer.address ?? "",
          phone: customer.phone ?? "",
          invoiceCompanyName: customer.companyName ?? "",
          invoiceTaxCode: customer.taxCode ?? "",
          invoiceAddress: customer.invoiceAddress ?? "",
          invoiceEmail: customer.invoiceEmail ?? "",
        }}
      />
    </div>
  );
}
