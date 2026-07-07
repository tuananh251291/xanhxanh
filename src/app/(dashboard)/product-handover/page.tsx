import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import ProductHandoverBoard from "./product-handover-board";

export default async function ProductHandoverPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/product-handover"))) redirect("/dashboard");
  if (role !== "CAY_MO") redirect("/dashboard");

  return <ProductHandoverBoard />;
}
