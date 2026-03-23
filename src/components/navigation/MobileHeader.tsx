'use client';

import { Menu } from "lucide-react";

interface MobileHeaderProps {
  userEmail?: string | null;
  onToggleSidebar: () => void;
}

export function MobileHeader({ userEmail, onToggleSidebar }: MobileHeaderProps) {
  return (
    <header className="bg-white shadow-sm">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleSidebar}
            className="text-gray-700 hover:text-primary focus:outline-none transition-colors"
            aria-label="Toggle menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
        <div className="flex items-center">
          {userEmail && (
            <span className="mr-4 hidden md:inline text-sm text-muted-foreground">
              {userEmail}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
