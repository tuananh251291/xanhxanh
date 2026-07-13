import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import PlantingCheckBoard from "./planting-check-board";

export default async function PlantingCheckPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/planting-check"))) redirect("/dashboard");

  return <PlantingCheckBoard />;
}
