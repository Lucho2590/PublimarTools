'use client';

import { useState, useEffect, useCallback } from "react";
import {
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
} from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { TEvent } from "@/types/event";
import { NewEventInput } from "@/hooks/useCalendarEvents";
import AgendaToolbar, { AgendaViewMode } from "./AgendaToolbar";
import MonthView from "./MonthView";
import WeekView from "./WeekView";
import DayView from "./DayView";
import EventFormDialog from "./EventFormDialog";

interface FullAgendaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionLabel: string;
  initialDate?: Date;
  getEventsForDay: (day: Date) => TEvent[];
  createEvent: (date: Date, input: NewEventInput) => Promise<boolean>;
  updateEvent: (
    event: TEvent,
    date: Date,
    input: NewEventInput
  ) => Promise<boolean>;
  deleteEvent: (eventId: string) => Promise<boolean>;
  isSubmitting: boolean;
}

export default function FullAgendaModal({
  open,
  onOpenChange,
  sectionLabel,
  initialDate,
  getEventsForDay,
  createEvent,
  updateEvent,
  deleteEvent,
  isSubmitting,
}: FullAgendaModalProps) {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<AgendaViewMode>("month");
  const [userChoseView, setUserChoseView] = useState(false);
  const [cursorDate, setCursorDate] = useState<Date>(initialDate ?? new Date());

  // Default SSR-safe: mes en desktop, día en mobile (si el usuario no eligió)
  useEffect(() => {
    if (!open || userChoseView) return;
    setViewMode(isMobile ? "day" : "month");
  }, [open, isMobile, userChoseView]);

  // Estado del formulario de evento
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TEvent | null>(null);
  const [formDate, setFormDate] = useState<Date>(new Date());

  const handleViewModeChange = (mode: AgendaViewMode) => {
    setUserChoseView(true);
    setViewMode(mode);
  };

  const step = useCallback(
    (dir: 1 | -1) => {
      setCursorDate((d) => {
        if (viewMode === "month")
          return dir === 1 ? addMonths(d, 1) : subMonths(d, 1);
        if (viewMode === "week")
          return dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1);
        return dir === 1 ? addDays(d, 1) : subDays(d, 1);
      });
    },
    [viewMode]
  );

  const openNew = (date: Date) => {
    setEditingEvent(null);
    setFormDate(date);
    setFormOpen(true);
  };

  const openEdit = (event: TEvent) => {
    setEditingEvent(event);
    setFormDate((event.date as any)?.toDate?.() ?? new Date(event.date as any));
    setFormOpen(true);
  };

  const selectDay = (day: Date) => {
    setCursorDate(day);
    setUserChoseView(true);
    setViewMode("day");
  };

  const handleSubmit = async (input: NewEventInput) => {
    if (editingEvent) {
      return updateEvent(editingEvent, formDate, input);
    }
    return createEvent(formDate, input);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] h-[92vh] w-[95vw] max-w-[95vw] flex-col gap-0 p-0 sm:rounded-lg">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CalendarIcon className="h-5 w-5 text-blue-900" />
              Agenda — {sectionLabel}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cerrar</span>
            </Button>
          </DialogHeader>

          <AgendaToolbar
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            cursorDate={cursorDate}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onToday={() => setCursorDate(new Date())}
            onNew={() => openNew(cursorDate)}
          />

          <div className="flex-1 overflow-y-auto">
            {viewMode === "month" && (
              <MonthView
                cursorDate={cursorDate}
                getEventsForDay={getEventsForDay}
                onSelectDay={selectDay}
                onEditEvent={openEdit}
                onCreateForDay={openNew}
              />
            )}
            {viewMode === "week" && (
              <WeekView
                cursorDate={cursorDate}
                getEventsForDay={getEventsForDay}
                onSelectDay={selectDay}
                onEditEvent={openEdit}
                onDeleteEvent={deleteEvent}
              />
            )}
            {viewMode === "day" && (
              <DayView
                cursorDate={cursorDate}
                getEventsForDay={getEventsForDay}
                onEditEvent={openEdit}
                onDeleteEvent={deleteEvent}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EventFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingEvent={editingEvent}
        date={formDate}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </>
  );
}
