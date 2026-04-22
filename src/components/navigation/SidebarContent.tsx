'use client';

import React, { useMemo } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LogOut, ChevronsLeft, ChevronsRight } from "lucide-react";
import { navConfig, NavItem as TNavItem } from "./navConfig";
import { NavItem } from "./NavItem";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute } from "@/lib/permissions";
import { EUserRole } from "@/types/user";

function filterNavByRole(items: TNavItem[], role: EUserRole | null): TNavItem[] {
  return items
    .filter((item) => canAccessRoute(role, item.href))
    .map((item) =>
      item.subItems
        ? { ...item, subItems: filterNavByRole(item.subItems, role) }
        : item
    );
}

interface SidebarContentProps {
  isSidebarOpen: boolean;
  expandedItems: string[];
  unviewedCount: number;
  isMobile: boolean;
  onToggleSidebar?: () => void;
  onToggleItem: (itemName: string) => void;
  onNavigate: () => void;
  onLogout: () => void;
}

export function SidebarContent({
  isSidebarOpen,
  expandedItems,
  unviewedCount,
  isMobile,
  onToggleSidebar,
  onToggleItem,
  onNavigate,
  onLogout,
}: SidebarContentProps) {
  const isOpen = isSidebarOpen || isMobile;
  const { userRole } = useAuth();
  const visibleNav = useMemo(() => filterNavByRole(navConfig, userRole), [userRole]);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-blue-950 text-white">
        {/* Header */}
        <div className={cn("p-4", isOpen ? "flex items-center justify-between" : "flex flex-col items-center gap-2")}>
          {isOpen ? (
            <>
              <div className="flex items-center gap-3">
                <Image
                  src="/imagenes/favicon-publimar-tools.png"
                  alt="PublimarTools"
                  width={32}
                  height={32}
                  className="rounded-lg"
                />
                <span className="text-lg font-bold tracking-tight">PublimarTools</span>
              </div>
              {!isMobile && onToggleSidebar && (
                <button
                  onClick={onToggleSidebar}
                  className="p-1.5 rounded-lg text-blue-400 hover:text-white hover:bg-blue-800/50 transition-all duration-200"
                >
                  <ChevronsLeft className="h-5 w-5" />
                </button>
              )}
            </>
          ) : (
            <>
              <Image
                src="/imagenes/favicon-publimar-tools.png"
                alt="PublimarTools"
                width={36}
                height={36}
                className="rounded-lg"
              />
              {!isMobile && onToggleSidebar && (
                <button
                  onClick={onToggleSidebar}
                  className="p-1.5 rounded-lg text-blue-400 hover:text-white hover:bg-blue-800/50 transition-all duration-200"
                >
                  <ChevronsRight className="h-5 w-5" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Separador */}
        <div className="mx-4 border-t border-blue-800/60" />

        {/* Navigation */}
        <nav className="mt-3 flex-1 overflow-y-auto">
          <ul className="space-y-1">
            {visibleNav.map((item, index) => (
              <React.Fragment key={item.name}>
                {/* Separador entre secciones principales (no antes del primero) */}
                {index > 0 && (
                  <li className="px-4 py-2">
                    <div className="border-t border-blue-800/40" />
                    {isOpen && item.subItems && (
                      <span className="text-[10px] uppercase tracking-wider text-blue-500 mt-2 block">
                        {item.name}
                      </span>
                    )}
                  </li>
                )}
                <NavItem
                  item={item}
                  isExpanded={expandedItems.includes(item.name)}
                  isSidebarOpen={isSidebarOpen}
                  unviewedCount={unviewedCount}
                  onToggle={() => onToggleItem(item.name)}
                  onNavigate={onNavigate}
                />
              </React.Fragment>
            ))}
          </ul>
        </nav>

        {/* Separador */}
        <div className="mx-4 border-t border-blue-800/60" />

        {/* Logout Button */}
        <div className="p-3">
          <Button
            variant="ghost"
            className={cn(
              "w-full text-blue-300 hover:text-white hover:bg-blue-800/50 transition-all duration-200",
              isOpen ? "justify-start" : "justify-center"
            )}
            onClick={onLogout}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {isOpen && <span className="ml-3 text-sm">Cerrar sesion</span>}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
