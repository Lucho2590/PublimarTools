"use client";

import { useState } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PinSwatch } from "@/components/admin/PinColorPicker";
import { TDeviceType } from "@/types/device";

interface DeviceTypeFilterProps {
  deviceTypes: TDeviceType[];
  /** El mismo Set que usan los chips de arriba: una sola fuente de verdad. */
  selected: Set<string>;
  onToggle: (deviceTypeId: string) => void;
  onClear: () => void;
  onSelectAll: () => void;
  stats?: Record<string, { locations: number; units: number }>;
}

/**
 * Selector múltiple de tipos de dispositivo. Es 100% controlado (no guarda
 * selección propia), así que queda sincronizado con los chips por construcción.
 */
export function DeviceTypeFilter({
  deviceTypes,
  selected,
  onToggle,
  onClear,
  onSelectAll,
  stats,
}: DeviceTypeFilterProps) {
  const [open, setOpen] = useState(false);

  const label =
    selected.size === 0
      ? "Todos los dispositivos"
      : selected.size === 1
        ? (deviceTypes.find((dt) => selected.has(dt.id))?.name ?? "1 tipo")
        : `${selected.size} tipos`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={deviceTypes.length === 0}
          className="w-full justify-start gap-2 sm:w-64"
        >
          <Filter className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-slate-500" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tipo de dispositivo
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onClear}
              disabled={selected.size === 0}
            >
              Limpiar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onSelectAll}
              disabled={selected.size === deviceTypes.length}
            >
              Todos
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-72">
          <div className="p-1">
            {deviceTypes.map((deviceType) => {
              const usage = stats?.[deviceType.id];
              return (
                // label (y no button): el Checkbox de Radix ya renderiza un
                // <button>, anidarlos sería HTML inválido.
                <label
                  key={deviceType.id}
                  htmlFor={`dtf-${deviceType.id}`}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    id={`dtf-${deviceType.id}`}
                    checked={selected.has(deviceType.id)}
                    onCheckedChange={() => onToggle(deviceType.id)}
                  />
                  <PinSwatch colorKey={deviceType.pinColor} className="h-2.5 w-2.5" />
                  <span className="flex-1 truncate">{deviceType.name}</span>
                  {usage && (
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                      {usage.locations} ub · {usage.units} u
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
