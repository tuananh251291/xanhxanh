import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import OutputDeviationResponseBoard from "./output-deviation-response-board";

export default async function OutputDeviationResponsePage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/output-deviation-response"))) redirect("/dashboard");

  return <OutputDeviationResponseBoard />;
}
