import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import ProductPricesContent from "./product-prices-content";

export default async function ProductPricesPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/product-prices"))) redirect("/dashboard");
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  return <ProductPricesContent />;
}
