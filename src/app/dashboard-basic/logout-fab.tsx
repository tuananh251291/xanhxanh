"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function LogoutFab() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-sm font-medium text-destructive shadow-lg hover:bg-danger-light transition-colors"
    >
      <LogOut className="w-4 h-4 shrink-0" />
      Đăng xuất
    </button>
  );
}
