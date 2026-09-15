"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PIN_COLORS,
  DEFAULT_PIN_COLOR_KEY,
  getPinColor,
  TPinColorKey,
} from "@/lib/pinColors";

/**
 * Punto de color de un tipo de dispositivo. Se usa como leyenda del mapa en
 * las filas de la lista, los chips de filtro y el popup del mapa.
 */
export function PinSwatch({
  colorKey,
  className,
}: {
  colorKey?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10", className)}
      style={{ backgroundColor: getPinColor(colorKey).hex }}
    />
  );
}

interface PinColorPickerProps {
  value?: TPinColorKey;
  onChange: (key: TPinColorKey) => void;
  disabled?: boolean;
  className?: string;
}

export function PinColorPicker({
  value = DEFAULT_PIN_COLOR_KEY,
  onChange,
  disabled,
  className,
}: PinColorPickerProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="radiogroup" aria-label="Color del pin">
      {PIN_COLORS.map((color) => {
        const selected = color.key === value;
        return (
          <button
            key={color.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={color.label}
            title={color.label}
            disabled={disabled}
            onClick={() => onChange(color.key)}
            style={{ backgroundColor: color.hex }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition",
              "ring-offset-2 ring-offset-white hover:scale-105 disabled:opacity-50 disabled:hover:scale-100",
              selected ? "ring-2 ring-slate-900" : "ring-1 ring-black/10",
            )}
          >
            {selected && <Check className="h-4 w-4 text-white drop-shadow" />}
          </button>
        );
      })}
    </div>
  );
}
