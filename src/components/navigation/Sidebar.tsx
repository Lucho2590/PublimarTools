"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarContent } from "./SidebarContent";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isMobile: boolean;
  isSidebarOpen: boolean;
  expandedItems: string[];
  unviewedCount: number;
  onToggleSidebar: () => void;
  onCloseSidebar: () => void;
  onToggleItem: (itemName: string) => void;
  onLogout: () => void;
}

export function Sidebar({
  isMobile,
  isSidebarOpen,
  expandedItems,
  unviewedCount,
  onToggleSidebar,
  onCloseSidebar,
  onToggleItem,
  onLogout,
}: SidebarProps) {
  if (isMobile) {
    return (
      <Sheet
        open={isSidebarOpen}
        onOpenChange={(open) => !open && onCloseSidebar()}
      >
        <SheetContent
          side="left"
          className="p-0 w-64 bg-blue-950 border-blue-900"
        >
          <SidebarContent
            isSidebarOpen={true}
            expandedItems={expandedItems}
            unviewedCount={unviewedCount}
            isMobile={true}
            onToggleItem={onToggleItem}
            onNavigate={onCloseSidebar}
            onLogout={onLogout}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className={cn(
        "bg-blue-950 text-white flex flex-col transition-all duration-300 ease-in-out",
        isSidebarOpen ? "w-64" : "w-[72px]",
      )}
    >
      <SidebarContent
        isSidebarOpen={isSidebarOpen}
        expandedItems={expandedItems}
        unviewedCount={unviewedCount}
        isMobile={false}
        onToggleSidebar={onToggleSidebar}
        onToggleItem={onToggleItem}
        onNavigate={() => {}}
        onLogout={onLogout}
      />
    </aside>
  );
}
