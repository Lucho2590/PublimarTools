'use client';

import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Clock, Trash2, Edit2, Calendar as CalendarIcon, User } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { TEvent, EEventSection } from "@/types/event";
import { addDoc, collection, deleteDoc, doc, updateDoc, getDoc, Timestamp } from "firebase/firestore";
import { useFirestore } from "reactfire";
import collections from "@/lib/collections";
import { toast } from "sonner";
import { es } from "date-fns/locale";
import { sendEventToN8n } from "@/lib/n8nWebhook";

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

  // Filtrar eventos del día seleccionado
  const eventsForSelectedDate = events?.filter((event) => {
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

  // Obtener días con eventos para marcar en el calendario
  const daysWithEvents = events?.map((event) => {
    const eventDate = event.date?.toDate ? event.date.toDate() : new Date(event.date);
    return eventDate;
  }) || [];

  const handleCreateEvent = async () => {
    if (!newEvent.title || !newEvent.time) {
      toast.error("El título y la hora son obligatorios");
      return;
    }

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
    }
  };

  const handleUpdateEvent = async () => {
    if (!editingEvent || !newEvent.title || !newEvent.time) {
      toast.error("El título y la hora son obligatorios");
      return;
    }

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
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      // Obtener los datos del evento antes de eliminarlo
      const eventRef = doc(firestore, collections.EVENTS, eventId);
      const eventDoc = await getDoc(eventRef);

      if (eventDoc.exists()) {
        const eventData = eventDoc.data();

        // Eliminar de Firestore
        await deleteDoc(eventRef);

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
  };

  const modifiersClassNames = {
    hasEvent: 'relative after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-blue-900 after:rounded-full',
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
        <CardContent className="flex justify-center pb-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            locale={es}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            className="rounded-md border"
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
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-10 w-10 text-slate-300 mb-3" />
                <p className="text-slate-500 text-sm font-medium">
                  No hay eventos
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Haz clic en "Nuevo" para agregar uno
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal para crear/editar evento */}
      <Dialog open={showEventModal} onOpenChange={setShowEventModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? "Editar Evento" : "Nuevo Evento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                placeholder="Título del evento"
                value={newEvent.title}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, title: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Hora *</Label>
              <Input
                id="time"
                type="time"
                value={newEvent.time}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, time: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                placeholder="Descripción del evento (opcional)"
                value={newEvent.description}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, description: e.target.value })
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button
              onClick={editingEvent ? handleUpdateEvent : handleCreateEvent}
              className="bg-blue-900 hover:bg-blue-800"
            >
              {editingEvent ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
