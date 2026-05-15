'use client';

import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  format,
} from "date-fns";
import { es } from "date-fns/locale";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEvent } from "@/types/event";
import { getEfemeride, isEfemeride } from "@/lib/efemerides";
import EventCard from "./EventCard";

interface WeekViewProps {
  cursorDate: Date;
  getEventsForDay: (day: Date) => TEvent[];
  onSelectDay: (day: Date) => void;
  onEditEvent: (event: TEvent) => void;
  onDeleteEvent: (eventId: string) => void;
}

export default function WeekView({
  cursorDate,
  getEventsForDay,
  onSelectDay,
  onEditEvent,
  onDeleteEvent,
}: WeekViewProps) {
  const start = startOfWeek(cursorDate, { weekStartsOn: 1 });
  const end = endOfWeek(cursorDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-7 lg:divide-x">
      {days.map((day) => {
        const today = isToday(day);
        const efem = isEfemeride(day) ? getEfemeride(day) : undefined;
        const events = getEventsForDay(day);

        return (
          <div key={day.toISOString()} className="flex flex-col border-b lg:border-b-0">
            <button
              type="button"
              onClick={() => onSelectDay(day)}
              className={cn(
                "px-3 py-2 text-left border-b transition-colors hover:bg-slate-50",
                today && "bg-blue-50"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs font-medium capitalize",
                    today ? "text-blue-900" : "text-slate-600"
                  )}
                >
                  {format(day, "EEE d", { locale: es })}
                </span>
                {efem && <Flag className="h-3.5 w-3.5 text-sky-600" />}
              </div>
              {efem && (
                <span
                  className="mt-0.5 block truncate text-[10px] font-medium text-sky-700"
                  title={efem.title}
                >
                  {efem.title}
                </span>
              )}
            </button>

            <div className="flex-1 space-y-2 p-2 min-h-[80px]">
              {events.length > 0 ? (
                events.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    onEdit={onEditEvent}
                    onDelete={onDeleteEvent}
                  />
                ))
              ) : (
                <p className="px-1 py-2 text-xs text-slate-400">Sin eventos</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
