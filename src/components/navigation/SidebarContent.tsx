'use client';

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LogOut, ChevronsLeft, ChevronsRight } from "lucide-react";
import { navConfig } from "./navConfig";
import { NavItem } from "./NavItem";

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
  return (
    <div className="flex flex-col h-full bg-blue-950 text-white">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        {isSidebarOpen || isMobile ? (
          <>
            <h2 className="text-xl font-bold">PublimarTools</h2>
            <Image
              src="/imagenes/favicon-publimar-tools.png"
              alt="PublimarTools"
              width={30}
              height={30}
              className="rounded"
            />
          </>
        ) : (
          <Image
            src="/imagenes/favicon-publimar-tools.png"
            alt="PublimarTools"
            width={45}
            height={45}
            className="rounded mx-auto"
          />
        )}
        {!isMobile && onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="text-white focus:outline-none hover:text-blue-300 transition-colors"
          >
            {isSidebarOpen ? (
              <ChevronsLeft className="h-6 w-6" />
            ) : (
              <ChevronsRight className="h-6 w-6" />
            )}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-6 flex-1 overflow-y-auto">
        <ul>
          {navConfig.map((item) => (
            <NavItem
              key={item.name}
              item={item}
              isExpanded={expandedItems.includes(item.name)}
              isSidebarOpen={isSidebarOpen}
              unviewedCount={unviewedCount}
              onToggle={() => onToggleItem(item.name)}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      </nav>

      {/* Logout Button */}
      <div className="p-4">
        <Button
          variant="outline"
          className="w-full justify-start text-white bg-blue-950 border-blue-800 hover:bg-blue-900 hover:text-white"
          onClick={onLogout}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {isSidebarOpen && <span className="ml-3">Cerrar sesión</span>}
        </Button>
      </div>
    </div>
  );
}
