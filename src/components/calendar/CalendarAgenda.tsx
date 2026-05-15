'use client';

import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Clock, Trash2, Edit2, Calendar as CalendarIcon, User, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { TEvent, EEventSection } from "@/types/event";
import { addDoc, collection, doc, updateDoc, getDoc, Timestamp } from "firebase/firestore";
import { softDelete } from '@/lib/softDelete';
import { useFirestore } from "reactfire";
import collections from "@/lib/collections";
import { toast } from "sonner";
import { es } from "date-fns/locale";
import { sendEventToN8n } from "@/lib/n8nWebhook";
import { getEfemeride, isEfemeride } from "@/lib/efemerides";
import { Flag } from "lucide-react";

interface CalendarAgendaProps {
  events: TEvent[];
  currentUserId: string;
  currentUserName: string;
  section: EEventSection;
}

export default function CalendarAgenda({ events, currentUserId, currentUserName, section }: CalendarAgendaProps) {
  const firestore = useFirestore();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TEvent | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    time: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Excluir eventos eliminados (softDelete marca deleted: true)
  const activeEvents = (events || []).filter((event: any) => !event.deleted);

  // Filtrar eventos del día seleccionado
  const eventsForSelectedDate = activeEvents.filter((event) => {
    if (!selectedDate) return false;
    const eventDate = event.date?.toDate ? event.date.toDate() : new Date(event.date);
    return (
      eventDate.getDate() === selectedDate.getDate() &&
      eventDate.getMonth() === selectedDate.getMonth() &&
      eventDate.getFullYear() === selectedDate.getFullYear()
    );
  }).sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
    return dateA.getTime() - dateB.getTime();
  });

  // Efeméride patria del día seleccionado (aplica a todos los usuarios)
  const efemerideForSelectedDate = selectedDate
    ? getEfemeride(selectedDate)
    : undefined;

  // Obtener días con eventos para marcar en el calendario
  const daysWithEvents = activeEvents.map((event) => {
    const eventDate = event.date?.toDate ? event.date.toDate() : new Date(event.date);
    return eventDate;
  });

  const handleCreateEvent = async () => {
    if (isSubmitting) return;
    if (!newEvent.title || !newEvent.time) {
      toast.error("El título y la hora son obligatorios");
      return;
    }

    setIsSubmitting(true);
    try {
      const eventDate = new Date(selectedDate || new Date());
      const [hours, minutes] = newEvent.time.split(":");
      eventDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const docRef = await addDoc(collection(firestore, collections.EVENTS), {
        title: newEvent.title,
        description: newEvent.description || "",
        date: eventDate,
        section: section,
        createdBy: currentUserId,
        createdByName: currentUserName,
        createdAt: new Date(),
      });

      // Enviar a n8n para sincronizar con Google Calendar
      await sendEventToN8n("create", {
        id: docRef.id,
        title: newEvent.title,
        description: newEvent.description || "",
        date: eventDate,
        createdBy: currentUserId,
        createdByName: currentUserName,
      });

      setNewEvent({ title: "", description: "", time: "" });
      setShowEventModal(false);
      toast.success("Evento creado correctamente");
    } catch (error) {
      console.error("Error al crear evento:", error);
      toast.error("Error al crear el evento");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateEvent = async () => {
    if (isSubmitting) return;
    if (!editingEvent || !newEvent.title || !newEvent.time) {
      toast.error("El título y la hora son obligatorios");
      return;
    }

    setIsSubmitting(true);
    try {
      const eventDate = new Date(selectedDate || new Date());
      const [hours, minutes] = newEvent.time.split(":");
      eventDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const eventRef = doc(firestore, collections.EVENTS, editingEvent.id);
      await updateDoc(eventRef, {
        title: newEvent.title,
        description: newEvent.description || "",
        date: eventDate,
      });

      // Enviar a n8n para actualizar en Google Calendar
      await sendEventToN8n("update", {
        id: editingEvent.id,
        title: newEvent.title,
        description: newEvent.description || "",
        date: eventDate,
        createdBy: editingEvent.createdBy,
        createdByName: editingEvent.createdByName,
      });

      setNewEvent({ title: "", description: "", time: "" });
      setEditingEvent(null);
      setShowEventModal(false);
      toast.success("Evento actualizado correctamente");
    } catch (error) {
      console.error("Error al actualizar evento:", error);
      toast.error("Error al actualizar el evento");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      // Obtener los datos del evento antes de eliminarlo
      const eventRef = doc(firestore, collections.EVENTS, eventId);
      const eventDoc = await getDoc(eventRef);

      if (eventDoc.exists()) {
        const eventData = eventDoc.data();

        // Eliminar de Firestore (soft delete)
        await softDelete(firestore, collections.EVENTS, eventId);

        // Enviar a n8n para eliminar de Google Calendar
        await sendEventToN8n("delete", {
          id: eventId,
          title: eventData.title || "",
          date: eventData.date?.toDate ? eventData.date.toDate() : new Date(),
          createdBy: eventData.createdBy || "",
          description: eventData.description,
          createdByName: eventData.createdByName,
        });

        toast.success("Evento eliminado correctamente");
      }
    } catch (error) {
      console.error("Error al eliminar evento:", error);
      toast.error("Error al eliminar el evento");
    }
  };

  const handleEditEvent = (event: TEvent) => {
    const eventDate = event.date?.toDate ? event.date.toDate() : new Date(event.date);
    setEditingEvent(event);
    setNewEvent({
      title: event.title,
      description: event.description || "",
      time: `${eventDate.getHours().toString().padStart(2, '0')}:${eventDate.getMinutes().toString().padStart(2, '0')}`,
    });
    setShowEventModal(true);
  };

  const handleCloseModal = () => {
    setShowEventModal(false);
    setEditingEvent(null);
    setNewEvent({ title: "", description: "", time: "" });
  };

  const handleOpenNewEventModal = () => {
    setEditingEvent(null);
    setNewEvent({ title: "", description: "", time: "" });
    setShowEventModal(true);
  };

  const modifiers = {
    hasEvent: daysWithEvents,
    efemeride: (date: Date) => isEfemeride(date),
  };

  const modifiersClassNames = {
    hasEvent: 'relative after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-blue-900 after:rounded-full',
    efemeride: 'relative font-semibold text-sky-700 before:content-[""] before:absolute before:top-1 before:left-1/2 before:-translate-x-1/2 before:w-1.5 before:h-1.5 before:bg-sky-500 before:rounded-full',
  };

  return (
    <div className="space-y-4">
      {/* Calendario */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-blue-900" />
            Agenda
          </CardTitle>
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
              head_cell: "text-slate-500 font-normal text-xs flex items-center justify-center h-9",
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
                const eventDate = event.date?.toDate ? event.date.toDate() : new Date(event.date);
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
                            {eventDate.getHours().toString().padStart(2, '0')}:
                            {eventDate.getMinutes().toString().padStart(2, '0')}
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
                          onClick={() => handleDeleteEvent(event.id)}
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

      {/* Modal para crear/editar evento */}
      <Dialog
        open={showEventModal}
        onOpenChange={(open) => {
          if (isSubmitting) return;
          if (!open) handleCloseModal();
          else setShowEventModal(true);
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <CalendarIcon className="h-5 w-5 text-blue-900" />
              {editingEvent ? "Editar evento" : "Nuevo evento"}
            </DialogTitle>
            {selectedDate && (
              <DialogDescription className="text-sm text-slate-600 capitalize">
                {selectedDate.toLocaleDateString("es-AR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </DialogDescription>
            )}
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingEvent) handleUpdateEvent();
              else handleCreateEvent();
            }}
          >
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-2">
                  <Label htmlFor="title">
                    Título <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    id="title"
                    autoFocus
                    placeholder="Ej: Reunión con cliente"
                    value={newEvent.title}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, title: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">
                    Hora <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    id="time"
                    type="time"
                    value={newEvent.time}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, time: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  placeholder="Detalles, participantes, lugar, etc. (opcional)"
                  value={newEvent.description}
                  onChange={(e) =>
                    setNewEvent({ ...newEvent, description: e.target.value })
                  }
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseModal}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-blue-900 hover:bg-blue-800"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {editingEvent ? "Guardando..." : "Creando..."}
                  </>
                ) : editingEvent ? (
                  "Guardar cambios"
                ) : (
                  "Crear evento"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
