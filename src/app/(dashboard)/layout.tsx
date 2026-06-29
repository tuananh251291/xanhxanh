import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/sonner";
import type { UserRole } from "@prisma/client";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        user={{
          name: session.user.name ?? "",
          email: session.user.email ?? "",
          role: session.user.role as UserRole,
        }}
      />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {children}
        </div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
