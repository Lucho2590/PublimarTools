'use client';

import React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LogOut, ChevronsLeft, ChevronsRight } from "lucide-react";
import { navConfig } from "./navConfig";
import { NavItem } from "./NavItem";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-blue-950 text-white">
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          {isOpen ? (
            <div className="flex items-center gap-3">
              <Image
                src="/imagenes/favicon-publimar-tools.png"
                alt="PublimarTools"
                width={32}
                height={32}
                className="rounded-lg"
              />
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight">PublimarTools</span>
              </div>
            </div>
          ) : (
            <Image
              src="/imagenes/favicon-publimar-tools.png"
              alt="PublimarTools"
              width={36}
              height={36}
              className="rounded-lg mx-auto"
            />
          )}
          {!isMobile && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-1.5 rounded-lg text-blue-400 hover:text-white hover:bg-blue-800/50 transition-all duration-200"
            >
              {isSidebarOpen ? (
                <ChevronsLeft className="h-5 w-5" />
              ) : (
                <ChevronsRight className="h-5 w-5" />
              )}
            </button>
          )}
        </div>

        {/* Separador */}
        <div className="mx-4 border-t border-blue-800/60" />

        {/* Navigation */}
        <nav className="mt-3 flex-1 overflow-y-auto">
          <ul className="space-y-1">
            {navConfig.map((item, index) => (
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
