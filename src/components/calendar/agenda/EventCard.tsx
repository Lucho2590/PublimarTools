'use client';

import { Button } from "@/components/ui/button";
import { Clock, Trash2, Edit2, User } from "lucide-react";
import { TEvent } from "@/types/event";
import { getEventColor } from "./eventColors";

interface EventCardProps {
  event: TEvent;
  onEdit: (event: TEvent) => void;
  onDelete: (eventId: string) => void;
}

// Tarjeta de evento (mismo lenguaje visual que la lista del widget CalendarAgenda)
export default function EventCard({ event, onEdit, onDelete }: EventCardProps) {
  const eventDate =
    (event.date as any)?.toDate?.() ?? new Date(event.date as any);
  const color = getEventColor(event.id);

  return (
    <div
      className={`border-l-4 ${color.bar} bg-slate-50 p-3 rounded-r-md hover:bg-slate-100 transition-colors`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />
            <span className="text-xs font-medium text-slate-600">
              {eventDate.getHours().toString().padStart(2, "0")}:
              {eventDate.getMinutes().toString().padStart(2, "0")}
            </span>
          </div>
          <h4 className="font-semibold text-sm mb-1 break-words text-slate-900">
            {event.title}
          </h4>
          {event.description && (
            <p className="text-xs text-slate-600 break-words mb-1">
              {event.description}
            </p>
          )}
          {event.createdByName && (
            <div className="flex items-center gap-1 mt-1">
              <User className="h-3 w-3 text-slate-500 flex-shrink-0" />
              <span className="text-xs text-slate-500 italic">
                {event.createdByName}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-slate-200"
            onClick={() => onEdit(event)}
          >
            <Edit2 className="h-3.5 w-3.5 text-slate-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => onDelete(event.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
