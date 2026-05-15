'use client';

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
} from "date-fns";
import { es } from "date-fns/locale";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEvent } from "@/types/event";
import { getEfemeride, isEfemeride } from "@/lib/efemerides";
import { getEventColor } from "./eventColors";

interface MonthViewProps {
  cursorDate: Date;
  getEventsForDay: (day: Date) => TEvent[];
  onSelectDay: (day: Date) => void;
  onEditEvent: (event: TEvent) => void;
  onCreateForDay: (day: Date) => void;
}

const MAX_CHIPS = 3;

export default function MonthView({
  cursorDate,
  getEventsForDay,
  onSelectDay,
  onEditEvent,
  onCreateForDay,
}: MonthViewProps) {
  const calendarStart = startOfWeek(startOfMonth(cursorDate), {
    weekStartsOn: 1,
  });
  const calendarEnd = endOfWeek(endOfMonth(cursorDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Encabezado de días */}
        <div className="grid grid-cols-7 border-b">
          {weekDays.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-xs font-medium text-slate-500"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Celdas */}
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = isSameMonth(day, cursorDate);
            const today = isToday(day);
            const efem = isEfemeride(day) ? getEfemeride(day) : undefined;
            const dayEvents = getEventsForDay(day);
            const shown = dayEvents.slice(0, MAX_CHIPS);
            const extra = dayEvents.length - shown.length;

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-[110px] border-b border-r p-1.5 flex flex-col gap-1 cursor-pointer transition-colors hover:bg-slate-50",
                  !inMonth && "bg-slate-50/60 text-slate-400"
                )}
                onClick={() => onCreateForDay(day)}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDay(day);
                    }}
                    className={cn(
                      "h-6 w-6 flex items-center justify-center rounded-full text-xs font-medium",
                      today
                        ? "bg-blue-900 text-white"
                        : "hover:bg-slate-200 text-slate-700",
                      !inMonth && !today && "text-slate-400"
                    )}
                  >
                    {format(day, "d")}
                  </button>
                  {efem && (
                    <Flag className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" />
                  )}
                </div>

                {efem && (
                  <div
                    className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 truncate"
                    title={efem.title}
                  >
                    {efem.title}
                  </div>
                )}

                {shown.map((ev) => {
                  const d =
                    (ev.date as any)?.toDate?.() ?? new Date(ev.date as any);
                  const color = getEventColor(ev.id);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditEvent(ev);
                      }}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-left text-[11px] truncate",
                        color.chip
                      )}
                      title={ev.title}
                    >
                      <span className="font-medium">
                        {d.getHours().toString().padStart(2, "0")}:
                        {d.getMinutes().toString().padStart(2, "0")}
                      </span>{" "}
                      {ev.title}
                    </button>
                  );
                })}

                {extra > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDay(day);
                    }}
                    className="text-left text-[11px] font-medium text-blue-900 hover:underline"
                  >
                    +{extra} más
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
