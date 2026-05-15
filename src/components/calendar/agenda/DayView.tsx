'use client';

import { Flag, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { TEvent } from "@/types/event";
import { getEfemeride, isEfemeride } from "@/lib/efemerides";
import EventCard from "./EventCard";

interface DayViewProps {
  cursorDate: Date;
  getEventsForDay: (day: Date) => TEvent[];
  onEditEvent: (event: TEvent) => void;
  onDeleteEvent: (eventId: string) => void;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function DayView({
  cursorDate,
  getEventsForDay,
  onEditEvent,
  onDeleteEvent,
}: DayViewProps) {
  const efem = isEfemeride(cursorDate) ? getEfemeride(cursorDate) : undefined;
  const events = getEventsForDay(cursorDate);

  return (
    <div className="p-4 space-y-3 max-w-3xl mx-auto">
      <h3 className="text-base font-semibold text-slate-800">
        {cap(format(cursorDate, "EEEE d 'de' MMMM", { locale: es }))}
      </h3>

      {efem && (
        <div className="border-l-4 border-l-sky-500 bg-sky-50 p-3 rounded-r-md">
          <div className="flex items-center gap-2 mb-1">
            <Flag className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" />
            <span className="text-xs font-medium text-sky-700">
              Efeméride patria
            </span>
          </div>
          <h4 className="font-semibold text-sm text-slate-900 break-words">
            {efem.title}
          </h4>
          {efem.description && (
            <p className="text-xs text-slate-600 break-words mt-1">
              {efem.description}
            </p>
          )}
        </div>
      )}

      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((ev) => (
            <EventCard
              key={ev.id}
              event={ev}
              onEdit={onEditEvent}
              onDelete={onDeleteEvent}
            />
          ))}
        </div>
      ) : (
        !efem && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-slate-500 text-sm font-medium">No hay eventos</p>
            <p className="text-xs text-slate-400 mt-1">
              Usá "Nuevo evento" para agregar uno
            </p>
          </div>
        )
      )}
    </div>
  );
}
