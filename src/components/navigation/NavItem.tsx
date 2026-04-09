'use client';

import React, { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NavItem as NavItemType } from "./navConfig";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItemProps {
  item: NavItemType;
  isExpanded: boolean;
  isSidebarOpen: boolean;
  unviewedCount: number;
  onToggle: () => void;
  onNavigate: () => void;
}

export const NavItem = memo(function NavItem({
  item,
  isExpanded,
  isSidebarOpen,
  unviewedCount,
  onToggle,
  onNavigate,
}: NavItemProps) {
  const pathname = usePathname();
  const Icon = item.icon;
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  const hasSubItems = item.subItems && item.subItems.length > 0;
  const showBadge = item.badge === "unviewed" && unviewedCount > 0;

  const linkContent = (
    <Link
      href={item.href}
      prefetch={true}
      onClick={onNavigate}
      className={cn(
        "flex items-center p-2.5 rounded-lg flex-1 relative transition-all duration-200",
        isActive
          ? "bg-blue-600/40 text-white"
          : "text-blue-300 hover:bg-blue-800/50 hover:text-white"
      )}
    >
      {/* Barra lateral activa */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-white rounded-r-full" />
      )}
      <Icon className={cn("h-5 w-5 shrink-0", isActive && "text-white")} />
      {isSidebarOpen && (
        <span className="ml-3 font-semibold text-sm flex items-center truncate">
          {item.name}
          {showBadge && (
            <span className="ml-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center">
              {unviewedCount}
            </span>
          )}
        </span>
      )}
      {!isSidebarOpen && showBadge && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-0.5 flex items-center justify-center">
          {unviewedCount}
        </span>
      )}
    </Link>
  );

  const wrappedLink = !isSidebarOpen ? (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {item.name}
      </TooltipContent>
    </Tooltip>
  ) : (
    linkContent
  );

  return (
    <li className="px-2 py-0.5">
      {hasSubItems ? (
        <>
          <div className="flex items-center">
            {wrappedLink}
            {isSidebarOpen && (
              <button
                onClick={onToggle}
                className="p-2 hover:bg-blue-800/50 rounded-lg transition-all duration-200"
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-200 text-blue-400",
                    isExpanded && "rotate-180"
                  )}
                />
              </button>
            )}
          </div>
          <div
            className={cn(
              "overflow-hidden transition-all duration-200",
              isSidebarOpen && isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <ul className="ml-3 mt-1 border-l border-blue-800 pl-2">
              {item.subItems?.map((subItem) => (
                <SubNavItem
                  key={subItem.name}
                  item={subItem}
                  isSidebarOpen={isSidebarOpen}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </div>
        </>
      ) : (
        wrappedLink
      )}
    </li>
  );
});

const SubNavItem = memo(function SubNavItem({
  item,
  isSidebarOpen,
  onNavigate,
}: {
  item: NavItemType;
  isSidebarOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const Icon = item.icon;
  const isActive = pathname === item.href;

  return (
    <li className="py-0.5">
      <Link
        href={item.href}
        prefetch={true}
        onClick={onNavigate}
        className={cn(
          "flex items-center p-2 rounded-lg transition-all duration-200 text-sm",
          isActive
            ? "bg-blue-600/30 text-white"
            : "text-blue-400 hover:bg-blue-800/40 hover:text-white"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-white")} />
        {isSidebarOpen && (
          <span className={cn("ml-2.5 truncate", isActive && "font-medium")}>
            {item.name}
          </span>
        )}
      </Link>
    </li>
  );
});
