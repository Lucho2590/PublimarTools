'use client';

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";

export type AgendaViewMode = "month" | "week" | "day";

interface AgendaToolbarProps {
  viewMode: AgendaViewMode;
  onViewModeChange: (mode: AgendaViewMode) => void;
  cursorDate: Date;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  onNew: () => void;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function periodLabel(mode: AgendaViewMode, date: Date): string {
  if (mode === "month") {
    return cap(format(date, "MMMM yyyy", { locale: es }));
  }
  if (mode === "week") {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    const sameMonth = start.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${format(start, "d", { locale: es })} – ${format(
        end,
        "d 'de' MMMM yyyy",
        { locale: es }
      )}`;
    }
    return `${format(start, "d MMM", { locale: es })} – ${format(
      end,
      "d MMM yyyy",
      { locale: es }
    )}`;
  }
  return cap(format(date, "EEEE d 'de' MMMM yyyy", { locale: es }));
}

export default function AgendaToolbar({
  viewMode,
  onViewModeChange,
  cursorDate,
  onPrev,
  onToday,
  onNext,
  onNew,
}: AgendaToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Navegación */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={onToday}>
          Hoy
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-1 text-sm font-semibold text-slate-800 sm:text-base">
          {periodLabel(viewMode, cursorDate)}
        </span>
      </div>

      {/* Switcher de vista + Nuevo */}
      <div className="flex items-center gap-2">
        <Tabs
          value={viewMode}
          onValueChange={(v) => onViewModeChange(v as AgendaViewMode)}
          className="flex-1 sm:flex-none"
        >
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
            <TabsTrigger value="month">Mes</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="day">Día</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          size="sm"
          onClick={onNew}
          className="h-8 bg-blue-900 hover:bg-blue-800 whitespace-nowrap"
        >
          <Plus className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Nuevo evento</span>
        </Button>
      </div>
    </div>
  );
}
