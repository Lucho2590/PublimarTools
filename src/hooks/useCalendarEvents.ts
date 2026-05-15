'use client';

import { useState, useCallback, useMemo } from "react";
import { addDoc, collection, doc, updateDoc, getDoc } from "firebase/firestore";
import { useFirestore } from "reactfire";
import { softDelete } from "@/lib/softDelete";
import collections from "@/lib/collections";
import { sendEventToN8n } from "@/lib/n8nWebhook";
import { TEvent, EEventSection } from "@/types/event";
import { toast } from "sonner";

export interface NewEventInput {
  title: string;
  description: string;
  time: string; // "HH:mm"
}

export interface UseCalendarEventsArgs {
  events: TEvent[];
  currentUserId: string;
  currentUserName: string;
  section: EEventSection;
}

export interface UseCalendarEventsResult {
  activeEvents: TEvent[];
  isSubmitting: boolean;
  toJsDate: (d: any) => Date | null;
  getEventsForDay: (day: Date) => TEvent[];
  getEventsForRange: (start: Date, end: Date) => TEvent[];
  createEvent: (date: Date, input: NewEventInput) => Promise<boolean>;
  updateEvent: (event: TEvent, date: Date, input: NewEventInput) => Promise<boolean>;
  deleteEvent: (eventId: string) => Promise<boolean>;
}

// Normaliza una fecha proveniente de Firestore (Timestamp, Date, {seconds}, string/number)
export function toJsDate(dateField: any): Date | null {
  if (!dateField) return null;
  if (dateField.toDate && typeof dateField.toDate === "function") {
    return dateField.toDate();
  }
  if (dateField instanceof Date) return dateField;
  if (typeof dateField === "object" && dateField.seconds !== undefined) {
    return new Date(dateField.seconds * 1000);
  }
  if (typeof dateField === "string" || typeof dateField === "number") {
    const date = new Date(dateField);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function applyTime(baseDate: Date, time: string): Date {
  const eventDate = new Date(baseDate);
  const [hours, minutes] = time.split(":");
  eventDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  return eventDate;
}

export function useCalendarEvents({
  events,
  currentUserId,
  currentUserName,
  section,
}: UseCalendarEventsArgs): UseCalendarEventsResult {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Eventos activos con fecha normalizada a Date
  const activeEvents = useMemo<TEvent[]>(() => {
    return (events || [])
      .filter((event: any) => !event.deleted)
      .map((event: any) => ({
        ...event,
        date: toJsDate(event.date) ?? new Date(),
      }));
  }, [events]);

  const getEventsForDay = useCallback(
    (day: Date) => {
      return activeEvents
        .filter((event) => {
          const d = event.date as Date;
          return (
            d.getDate() === day.getDate() &&
            d.getMonth() === day.getMonth() &&
            d.getFullYear() === day.getFullYear()
          );
        })
        .sort(
          (a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()
        );
    },
    [activeEvents]
  );

  const getEventsForRange = useCallback(
    (start: Date, end: Date) => {
      return activeEvents
        .filter((event) => {
          const t = (event.date as Date).getTime();
          return t >= start.getTime() && t <= end.getTime();
        })
        .sort(
          (a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()
        );
    },
    [activeEvents]
  );

  const createEvent = useCallback(
    async (date: Date, input: NewEventInput): Promise<boolean> => {
      if (isSubmitting) return false;
      if (!input.title || !input.time) {
        toast.error("El título y la hora son obligatorios");
        return false;
      }

      setIsSubmitting(true);
      try {
        const eventDate = applyTime(date || new Date(), input.time);

        const docRef = await addDoc(collection(firestore, collections.EVENTS), {
          title: input.title,
          description: input.description || "",
          date: eventDate,
          section: section,
          createdBy: currentUserId,
          createdByName: currentUserName,
          createdAt: new Date(),
        });

        await sendEventToN8n("create", {
          id: docRef.id,
          title: input.title,
          description: input.description || "",
          date: eventDate,
          createdBy: currentUserId,
          createdByName: currentUserName,
        });

        toast.success("Evento creado correctamente");
        return true;
      } catch (error) {
        console.error("Error al crear evento:", error);
        toast.error("Error al crear el evento");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [firestore, isSubmitting, section, currentUserId, currentUserName]
  );

  const updateEvent = useCallback(
    async (
      event: TEvent,
      date: Date,
      input: NewEventInput
    ): Promise<boolean> => {
      if (isSubmitting) return false;
      if (!event || !input.title || !input.time) {
        toast.error("El título y la hora son obligatorios");
        return false;
      }

      setIsSubmitting(true);
      try {
        const eventDate = applyTime(date || new Date(), input.time);

        const eventRef = doc(firestore, collections.EVENTS, event.id);
        await updateDoc(eventRef, {
          title: input.title,
          description: input.description || "",
          date: eventDate,
        });

        await sendEventToN8n("update", {
          id: event.id,
          title: input.title,
          description: input.description || "",
          date: eventDate,
          createdBy: event.createdBy,
          createdByName: event.createdByName,
        });

        toast.success("Evento actualizado correctamente");
        return true;
      } catch (error) {
        console.error("Error al actualizar evento:", error);
        toast.error("Error al actualizar el evento");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [firestore, isSubmitting]
  );

  const deleteEvent = useCallback(
    async (eventId: string): Promise<boolean> => {
      try {
        const eventRef = doc(firestore, collections.EVENTS, eventId);
        const eventDoc = await getDoc(eventRef);

        if (eventDoc.exists()) {
          const eventData = eventDoc.data();

          await softDelete(firestore, collections.EVENTS, eventId);

          await sendEventToN8n("delete", {
            id: eventId,
            title: eventData.title || "",
            date: eventData.date?.toDate
              ? eventData.date.toDate()
              : new Date(),
            createdBy: eventData.createdBy || "",
            description: eventData.description,
            createdByName: eventData.createdByName,
          });

          toast.success("Evento eliminado correctamente");
          return true;
        }
        return false;
      } catch (error) {
        console.error("Error al eliminar evento:", error);
        toast.error("Error al eliminar el evento");
        return false;
      }
    },
    [firestore]
  );

  return {
    activeEvents,
    isSubmitting,
    toJsDate,
    getEventsForDay,
    getEventsForRange,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
