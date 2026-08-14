import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import PlantTypesContent from "./plant-types-content";

export default async function PlantTypesPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/plant-types"))) redirect("/dashboard");

  return <PlantTypesContent />;
}
