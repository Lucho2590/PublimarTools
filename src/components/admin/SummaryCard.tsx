"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryCardOwnProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon: LucideIcon;
  /** Color del fondo del icono y del título destacado. */
  variant?: "blue" | "green" | "red" | "slate" | "amber";
  href?: string;
}

type SummaryCardProps = SummaryCardOwnProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof SummaryCardOwnProps>;

const VARIANT_STYLES: Record<
  NonNullable<SummaryCardOwnProps["variant"]>,
  { card: string; icon: string; value: string }
> = {
  blue: {
    card: "bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200",
    icon: "bg-blue-900",
    value: "text-blue-900",
  },
  green: {
    card: "bg-gradient-to-r from-green-50 to-green-100 border-green-200",
    icon: "bg-green-700",
    value: "text-green-800",
  },
  red: {
    card: "bg-gradient-to-r from-red-50 to-red-100 border-red-200",
    icon: "bg-red-700",
    value: "text-red-800",
  },
  slate: {
    card: "bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200",
    icon: "bg-slate-700",
    value: "text-slate-900",
  },
  amber: {
    card: "bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200",
    icon: "bg-amber-700",
    value: "text-amber-800",
  },
};

export const SummaryCard = React.forwardRef<HTMLDivElement, SummaryCardProps>(
  function SummaryCard(
    { title, value, subtitle, icon: Icon, variant = "blue", href, className, onClick, ...rest },
    ref,
  ) {
    const styles = VARIANT_STYLES[variant];
    const interactive = Boolean(onClick || href || rest.role === "button");

    const classes = cn(
      "border",
      styles.card,
      interactive && "cursor-pointer hover:shadow-md transition-all",
      className,
    );

    const card = (
      <Card ref={ref} className={cn("overflow-hidden", classes)} onClick={onClick} {...rest}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={cn("shrink-0 p-3 rounded-full text-white", styles.icon)}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-600 font-medium truncate">{title}</p>
                <div className={cn("text-xl font-bold break-words", styles.value)}>
                  {value}
                </div>
              </div>
            </div>
            {subtitle && (
              <div className="shrink-0 text-right text-sm text-slate-600">{subtitle}</div>
            )}
          </div>
        </CardContent>
      </Card>
    );

    if (href) {
      return (
        <Link href={href} className="block">
          {card}
        </Link>
      );
    }

    return card;
  },
);
