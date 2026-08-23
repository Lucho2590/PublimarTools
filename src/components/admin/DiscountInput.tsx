"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { cn } from "@/lib/utils";
import type { TDiscountType } from "@/lib/totals";

interface DiscountInputProps {
  /** Valor del descuento: % o $ según `type`. */
  value: number;
  type: TDiscountType;
  onValueChange: (value: number) => void;
  onTypeChange: (type: TDiscountType) => void;
  /** "sm" para filas de tabla / popovers, "md" para formularios. */
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  /** Ancho del input (el toggle %/$ es fijo). */
  inputClassName?: string;
}

/**
 * Control de descuento con toggle % / $ fijo.
 * En modo "$" usa MoneyInput (formato es-AR), como todo campo de dinero.
 */
export function DiscountInput({
  value,
  type,
  onValueChange,
  onTypeChange,
  size = "md",
  disabled,
  className,
  inputClassName,
}: DiscountInputProps) {
  // Cambiar de modo resetea el valor: un 15% no es lo mismo que $15.
  const handleTypeChange = (next: TDiscountType) => {
    if (next === type) return;
    onTypeChange(next);
    onValueChange(0);
  };

  const btnClass = size === "sm" ? "px-2 h-7 text-xs" : "px-3";

  return (
    <div className={cn("flex gap-2", className)}>
      <div className="flex rounded-md border bg-gray-50 p-0.5 shrink-0">
        <Button
          type="button"
          variant={type === "percent" ? "default" : "ghost"}
          size="sm"
          className={btnClass}
          disabled={disabled}
          onClick={() => handleTypeChange("percent")}
        >
          %
        </Button>
        <Button
          type="button"
          variant={type === "amount" ? "default" : "ghost"}
          size="sm"
          className={btnClass}
          disabled={disabled}
          onClick={() => handleTypeChange("amount")}
        >
          $
        </Button>
      </div>
      {type === "percent" ? (
        <Input
          type="number"
          min={0}
          max={100}
          value={value || ""}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            onValueChange(isNaN(v) ? 0 : Math.min(100, Math.max(0, v)));
          }}
          placeholder="0"
          className={cn(size === "sm" && "h-8", inputClassName)}
        />
      ) : (
        <MoneyInput
          value={value || 0}
          onValueChange={(n) => onValueChange(Math.max(0, n))}
          placeholder="0"
          disabled={disabled}
          className={cn(size === "sm" && "h-8", inputClassName)}
        />
      )}
    </div>
  );
}
