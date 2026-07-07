"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Users, Leaf, Warehouse, FlaskConical, BarChart3,
  Settings, ClipboardList, Sun, Moon, PenLine, PackageCheck,
  PackageOpen, Package, AlertTriangle, ShoppingCart, ShoppingBag, Sprout,
  LogOut, Bell, ChevronLeft, ChevronRight, UserCircle, Menu, Flag, Boxes, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ROLE_LABELS, type UserRole } from "@/types";
import { useState } from "react";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Users, Leaf, Warehouse, FlaskConical, BarChart3,
  Settings, ClipboardList, Sun, Moon, PenLine, PackageCheck,
  PackageOpen, Package, AlertTriangle, ShoppingCart, ShoppingBag, Sprout,
  UserCircle, Flag, Boxes, Send,
};

interface SidebarProps {
  user: { name: string; email: string; role: UserRole; avatar?: string | null };
  navItems: { href: string; label: string; icon: string }[];
  alertCount?: number;
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return collapsed ? (
    <div className="mx-auto bg-primary p-1.5 rounded-lg shrink-0">
      <Leaf className="w-5 h-5 text-primary-foreground" />
    </div>
  ) : (
    <div className="flex items-center gap-2 min-w-0">
      <div className="bg-primary p-1.5 rounded-lg shrink-0">
        <Leaf className="w-5 h-5 text-primary-foreground" />
      </div>
      <span className="font-bold text-lg truncate text-sidebar-foreground">Xanh Xanh</span>
    </div>
  );
}

function SidebarUser({ user }: { user: SidebarProps["user"] }) {
  return (
    <Link
      href="/account"
      className="flex items-center gap-3 px-4 py-3 border-b border-sidebar-border hover:bg-sidebar-accent transition-colors"
    >
      <Avatar size="sm" className="shrink-0">
        <AvatarImage src={user.avatar ?? undefined} alt={user.name} />
        <AvatarFallback className="bg-primary-light text-primary-strong">{user.name.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</p>
        <p className="text-xs text-text-muted truncate">{ROLE_LABELS[user.role]}</p>
      </div>
    </Link>
  );
}

function SidebarNav({ navItems, collapsed, onNavigate }: {
  navItems: SidebarProps["navItems"];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <ScrollArea className="flex-1">
      <nav className="p-2 space-y-1">
        {navItems.map((item) => {
          const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-text-secondary hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </ScrollArea>
  );
}

function SidebarFooter({ collapsed, alertCount, onNavigate }: {
  collapsed: boolean;
  alertCount: number;
  onNavigate?: () => void;
}) {
  return (
    <div className="p-2 border-t border-sidebar-border space-y-1">
      <Link
        href="/alerts"
        onClick={onNavigate}
        className="flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-sm text-text-secondary hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
      >
        <div className="relative shrink-0">
          <Bell className="w-5 h-5 shrink-0" />
          {alertCount > 0 && (
            <Badge className="absolute -top-1.5 -right-1.5 h-4 w-4 p-0 text-[10px] bg-destructive text-white justify-center">
              {alertCount > 9 ? "9+" : alertCount}
            </Badge>
          )}
        </div>
        {!collapsed && <span>Thông báo</span>}
      </Link>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-sm text-text-secondary hover:bg-sidebar-accent hover:text-destructive transition-colors w-full"
      >
        <LogOut className="w-5 h-5 shrink-0" />
        {!collapsed && <span>Đăng xuất</span>}
      </button>
    </div>
  );
}

export default function Sidebar({ user, navItems, alertCount = 0 }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar — thay thế sidebar cố định trên màn hình < md, tránh chiếm ngang không gian hẹp */}
      <div className="print:hidden md:hidden sticky top-0 z-40 flex items-center justify-between gap-2 h-14 px-3 bg-card text-foreground border-b border-border">
        <SidebarBrand collapsed={false} />
        <div className="flex items-center gap-1 shrink-0">
          <Link
            href="/alerts"
            className="relative flex items-center justify-center h-11 w-11 rounded-lg text-text-secondary hover:bg-primary-light hover:text-primary-strong"
            aria-label="Thông báo"
          >
            <Bell className="w-5 h-5" />
            {alertCount > 0 && (
              <Badge className="absolute top-1 right-1 h-4 w-4 p-0 text-[10px] bg-destructive text-white justify-center">
                {alertCount > 9 ? "9+" : alertCount}
              </Badge>
            )}
          </Link>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-text-secondary hover:bg-primary-light hover:text-primary-strong"
                />
              }
            >
              <Menu className="w-5 h-5" />
              <span className="sr-only">Mở menu</span>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-4/5 max-w-xs bg-sidebar text-sidebar-foreground border-sidebar-border p-0 gap-0"
            >
              <SheetTitle className="sr-only">Menu điều hướng</SheetTitle>
              <div className="flex items-center px-4 h-14 border-b border-sidebar-border shrink-0">
                <SidebarBrand collapsed={false} />
              </div>
              <SidebarUser user={user} />
              <SidebarNav navItems={navItems} collapsed={false} onNavigate={() => setMobileOpen(false)} />
              <SidebarFooter collapsed={false} alertCount={alertCount} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop sidebar — ẩn trên mobile, thay bằng top bar + drawer ở trên */}
      <div className={cn(
        "print:hidden hidden md:flex flex-col shrink-0 bg-sidebar text-sidebar-foreground transition-all duration-300 h-screen sticky top-0 border-r border-sidebar-border",
        collapsed ? "w-16" : "w-64"
      )}>
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <SidebarBrand collapsed={collapsed} />
          <Button
            variant="ghost"
            size="icon"
            className="text-text-muted hover:text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8 shrink-0"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>

        {!collapsed && <SidebarUser user={user} />}

        <SidebarNav navItems={navItems} collapsed={collapsed} />

        <SidebarFooter collapsed={collapsed} alertCount={alertCount} />
      </div>
    </>
  );
}
