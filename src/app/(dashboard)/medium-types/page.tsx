import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import MediumTypesContent from "./medium-types-content";

export default async function MediumTypesPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/medium-types"))) redirect("/dashboard");

  return <MediumTypesContent />;
}
