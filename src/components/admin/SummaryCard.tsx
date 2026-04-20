"use client";

import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  /** Color del fondo del icono y del título destacado. */
  variant?: "blue" | "green" | "red" | "slate" | "amber";
}

const VARIANT_STYLES: Record<
  NonNullable<SummaryCardProps["variant"]>,
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

export function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "blue",
}: SummaryCardProps) {
  const styles = VARIANT_STYLES[variant];
  return (
    <Card className={cn("border", styles.card)}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-3 rounded-full text-white", styles.icon)}>
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-600 font-medium">{title}</p>
              <p className={cn("text-2xl font-bold", styles.value)}>{value}</p>
            </div>
          </div>
          {subtitle && (
            <div className="text-right text-sm text-slate-600">{subtitle}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
