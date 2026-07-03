"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Users, Leaf, Warehouse, FlaskConical, BarChart3,
  Settings, ClipboardList, Sun, Moon, PenLine, PackageCheck,
  PackageOpen, Package, AlertTriangle, ShoppingCart, ShoppingBag,
  LogOut, Bell, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ROLE_LABELS, type UserRole } from "@/types";
import { useState } from "react";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Users, Leaf, Warehouse, FlaskConical, BarChart3,
  Settings, ClipboardList, Sun, Moon, PenLine, PackageCheck,
  PackageOpen, Package, AlertTriangle, ShoppingCart, ShoppingBag,
};

interface SidebarProps {
  user: { name: string; email: string; role: UserRole };
  navItems: { href: string; label: string; icon: string }[];
  alertCount?: number;
}

export default function Sidebar({ user, navItems, alertCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={cn(
      "print:hidden flex flex-col bg-gray-900 text-white transition-all duration-300 h-screen sticky top-0",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="bg-green-500 p-1.5 rounded-lg">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">Xanh Xanh</span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto bg-green-500 p-1.5 rounded-lg">
            <Leaf className="w-5 h-5 text-white" />
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-400 hover:text-white hover:bg-gray-700 h-8 w-8"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* User info */}
      {!collapsed && (
        <div className="px-4 py-3 border-b border-gray-700">
          <p className="text-sm font-medium text-white truncate">{user.name}</p>
          <p className="text-xs text-gray-400 truncate">{ROLE_LABELS[user.role]}</p>
        </div>
      )}

      {/* Nav */}
      <ScrollArea className="flex-1">
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-green-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Bottom */}
      <div className="p-2 border-t border-gray-700 space-y-1">
        <Link
          href="/alerts"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <div className="relative">
            <Bell className="w-5 h-5 shrink-0" />
            {alertCount > 0 && (
              <Badge className="absolute -top-1.5 -right-1.5 h-4 w-4 p-0 text-[10px] bg-red-500 justify-center">
                {alertCount > 9 ? "9+" : alertCount}
              </Badge>
            )}
          </div>
          {!collapsed && <span>Thông báo</span>}
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-red-400 transition-colors w-full"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Đăng xuất</span>}
        </button>
      </div>
    </div>
  );
}
