'use client';

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Plus,
  Clock,
  Trash2,
  Edit2,
  Calendar as CalendarIcon,
  User,
  Flag,
  Maximize2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { TEvent, EEventSection } from "@/types/event";
import { es } from "date-fns/locale";
import { getEfemeride, isEfemeride } from "@/lib/efemerides";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import EventFormDialog from "@/components/calendar/agenda/EventFormDialog";
import FullAgendaModal from "@/components/calendar/agenda/FullAgendaModal";

interface CalendarAgendaProps {
  events: TEvent[];
  currentUserId: string;
  currentUserName: string;
  section: EEventSection;
}

const SECTION_LABELS: Record<EEventSection, string> = {
  [EEventSection.BANDERAS]: "Banderas",
  [EEventSection.VIA_PUBLICA]: "Vía Pública",
  [EEventSection.ADMINISTRACION]: "Administración",
};

export default function CalendarAgenda({
  events,
  currentUserId,
  currentUserName,
  section,
}: CalendarAgendaProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TEvent | null>(null);
  const [showFullAgenda, setShowFullAgenda] = useState(false);

  const {
    activeEvents,
    isSubmitting,
    getEventsForDay,
    createEvent,
    updateEvent,
    deleteEvent,
  } = useCalendarEvents({ events, currentUserId, currentUserName, section });

  const eventsForSelectedDate = selectedDate
    ? getEventsForDay(selectedDate)
    : [];

  const efemerideForSelectedDate = selectedDate
    ? getEfemeride(selectedDate)
    : undefined;

  const daysWithEvents = activeEvents.map((event) => event.date as Date);

  const handleEditEvent = (event: TEvent) => {
    setEditingEvent(event);
    setShowEventModal(true);
  };

  const handleOpenNewEventModal = () => {
    setEditingEvent(null);
    setShowEventModal(true);
  };

  const handleSubmit = async (input: {
    title: string;
    description: string;
    time: string;
  }) => {
    const date = selectedDate || new Date();
    if (editingEvent) {
      return updateEvent(editingEvent, date, input);
    }
    return createEvent(date, input);
  };

  const modifiers = {
    hasEvent: daysWithEvents,
    efemeride: (date: Date) => isEfemeride(date),
  };

  const modifiersClassNames = {
    hasEvent:
      'relative after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-blue-900 after:rounded-full',
    efemeride:
      'relative font-semibold text-sky-700 before:content-[""] before:absolute before:top-1 before:left-1/2 before:-translate-x-1/2 before:w-1.5 before:h-1.5 before:bg-sky-500 before:rounded-full',
  };

  return (
    <div className="space-y-4">
      {/* Calendario */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-blue-900" />
            Agenda
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-blue-900 hover:bg-blue-50"
            onClick={() => setShowFullAgenda(true)}
          >
            <Maximize2 className="h-4 w-4 mr-1" />
            Ver agenda
          </Button>
        </CardHeader>
        <CardContent className="px-3 pb-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            locale={es}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            className="p-0 w-full"
            classNames={{
              months: "w-full",
              month: "w-full space-y-4",
              cell: "h-10 text-center text-sm p-0 relative flex items-center justify-center [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
              day: cn(
                buttonVariants({ variant: "ghost" }),
                "h-10 w-full p-0 font-normal text-sm aria-selected:opacity-100"
              ),
              head_cell:
                "text-slate-500 font-normal text-xs flex items-center justify-center h-9",
            }}
          />
        </CardContent>
      </Card>

      {/* Lista de eventos del día seleccionado */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">
            {selectedDate ? formatDate(selectedDate) : "Selecciona un día"}
          </CardTitle>
          <Button
            size="sm"
            onClick={handleOpenNewEventModal}
            className="bg-blue-900 hover:bg-blue-800"
          >
            <Plus className="h-4 w-4 mr-1" />
            Nuevo
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
            {efemerideForSelectedDate && (
              <div className="border-l-4 border-l-sky-500 bg-sky-50 p-3 rounded-r-md">
                <div className="flex items-center gap-2 mb-1">
                  <Flag className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" />
                  <span className="text-xs font-medium text-sky-700">
                    Efeméride patria
                  </span>
                </div>
                <h4 className="font-semibold text-sm text-slate-900 break-words">
                  {efemerideForSelectedDate.title}
                </h4>
                {efemerideForSelectedDate.description && (
                  <p className="text-xs text-slate-600 break-words mt-1">
                    {efemerideForSelectedDate.description}
                  </p>
                )}
              </div>
            )}
            {eventsForSelectedDate && eventsForSelectedDate.length > 0 ? (
              eventsForSelectedDate.map((event) => {
                const eventDate =
                  (event.date as any)?.toDate?.() ??
                  new Date(event.date as any);
                return (
                  <div
                    key={event.id}
                    className="border-l-4 border-l-blue-900 bg-slate-50 p-3 rounded-r-md hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />
                          <span className="text-xs font-medium text-slate-600">
                            {eventDate.getHours().toString().padStart(2, "0")}:
                            {eventDate
                              .getMinutes()
                              .toString()
                              .padStart(2, "0")}
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
                          onClick={() => handleEditEvent(event)}
                        >
                          <Edit2 className="h-3.5 w-3.5 text-slate-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteEvent(event.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              !efemerideForSelectedDate && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Clock className="h-10 w-10 text-slate-300 mb-3" />
                  <p className="text-slate-500 text-sm font-medium">
                    No hay eventos
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Haz clic en "Nuevo" para agregar uno
                  </p>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal crear/editar evento (compartido con la agenda completa) */}
      <EventFormDialog
        open={showEventModal}
        onOpenChange={(open) => {
          setShowEventModal(open);
          if (!open) setEditingEvent(null);
        }}
        editingEvent={editingEvent}
        date={selectedDate}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Agenda completa a pantalla completa */}
      <FullAgendaModal
        open={showFullAgenda}
        onOpenChange={setShowFullAgenda}
        sectionLabel={SECTION_LABELS[section]}
        initialDate={selectedDate}
        getEventsForDay={getEventsForDay}
        createEvent={createEvent}
        updateEvent={updateEvent}
        deleteEvent={deleteEvent}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
