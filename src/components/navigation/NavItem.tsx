'use client';

import React, { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NavItem as NavItemType } from "./navConfig";
import { cn } from "@/lib/utils";

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
  const isActive = pathname === item.href;
  const hasSubItems = item.subItems && item.subItems.length > 0;
  const showBadge = item.badge === "unviewed" && unviewedCount > 0;

  return (
    <li className="px-2 py-1">
      {hasSubItems ? (
        <>
          <div className="flex items-center">
            <Link
              href={item.href}
              prefetch={true}
              onClick={onNavigate}
              className={cn(
                "flex items-center p-2 rounded-md flex-1 relative transition-colors",
                isActive
                  ? "bg-blue-700 text-white"
                  : "text-blue-300 hover:bg-blue-900 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {isSidebarOpen && (
                <span className="ml-3 font-bold text-base flex items-center">
                  {item.name}
                  {showBadge && (
                    <span className="ml-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                      {unviewedCount}
                    </span>
                  )}
                </span>
              )}
            </Link>
            {isSidebarOpen && (
              <button
                onClick={onToggle}
                className="p-2 hover:bg-blue-900 rounded-md transition-colors"
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform text-blue-300",
                    isExpanded && "rotate-180"
                  )}
                />
              </button>
            )}
          </div>
          {isSidebarOpen && isExpanded && (
            <ul className="ml-4 mt-1">
              {item.subItems?.map((subItem) => (
                <SubNavItem
                  key={subItem.name}
                  item={subItem}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          )}
        </>
      ) : (
        <Link
          href={item.href}
          prefetch={true}
          onClick={onNavigate}
          className={cn(
            "flex items-center p-2 rounded-md relative transition-colors",
            isActive
              ? "bg-blue-700 text-white"
              : "text-blue-300 hover:bg-blue-900 hover:text-white"
          )}
        >
          <Icon className="h-5 w-5 shrink-0" />
          {isSidebarOpen && (
            <span className="ml-3 font-bold text-base flex items-center">
              {item.name}
              {showBadge && (
                <span className="ml-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {unviewedCount}
                </span>
              )}
            </span>
          )}
        </Link>
      )}
    </li>
  );
});

const SubNavItem = memo(function SubNavItem({
  item,
  onNavigate,
}: {
  item: NavItemType;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const Icon = item.icon;
  const isActive = pathname === item.href;

  return (
    <li className="py-1">
      <Link
        href={item.href}
        prefetch={true}
        onClick={onNavigate}
        className={cn(
          "flex items-center p-2 rounded-md transition-colors",
          isActive
            ? "bg-blue-700 text-white"
            : "text-blue-300 hover:bg-blue-900 hover:text-white"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="ml-3">{item.name}</span>
      </Link>
    </li>
  );
});
