'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { TEvent } from "@/types/event";
import { NewEventInput } from "@/hooks/useCalendarEvents";

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Evento en edición; null = creación */
  editingEvent: TEvent | null;
  /** Fecha del día sobre el que se crea/edita */
  date: Date | undefined;
  /** Hora inicial sugerida ("HH:mm"), p. ej. al clickear un slot */
  defaultTime?: string;
  onSubmit: (input: NewEventInput) => Promise<boolean> | void;
  isSubmitting: boolean;
}

function eventToTime(event: TEvent | null, fallback: string): string {
  if (!event) return fallback;
  const d =
    (event.date as any)?.toDate?.() ?? new Date(event.date as any);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export default function EventFormDialog({
  open,
  onOpenChange,
  editingEvent,
  date,
  defaultTime = "",
  onSubmit,
  isSubmitting,
}: EventFormDialogProps) {
  const [form, setForm] = useState<NewEventInput>({
    title: "",
    description: "",
    time: "",
  });

  // Sincronizar el formulario cada vez que se abre o cambia el evento
  useEffect(() => {
    if (!open) return;
    setForm({
      title: editingEvent?.title ?? "",
      description: editingEvent?.description ?? "",
      time: eventToTime(editingEvent, defaultTime),
    });
  }, [open, editingEvent, defaultTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onSubmit(form);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (isSubmitting) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CalendarIcon className="h-5 w-5 text-blue-900" />
            {editingEvent ? "Editar evento" : "Nuevo evento"}
          </DialogTitle>
          {date && (
            <DialogDescription className="text-sm text-slate-600 capitalize">
              {date.toLocaleDateString("es-AR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit}>
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
                  value={form.title}
                  onChange={(e) =>
                    setForm({ ...form, title: e.target.value })
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
                  value={form.time}
                  onChange={(e) =>
                    setForm({ ...form, time: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                placeholder="Detalles, participantes, lugar, etc. (opcional)"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
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
  );
}
