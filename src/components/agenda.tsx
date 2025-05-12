import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useFirestore } from "reactfire";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { useAuth } from "reactfire";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface AgendaProps {
  selectedDate: Date;
  events: any[];
  onEventAdded: () => void;
}

export function Agenda({ selectedDate, events, onEventAdded }: AgendaProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const firestore = useFirestore();
  const user = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      await addDoc(collection(firestore, "events"), {
        title,
        description,
        date: Timestamp.fromDate(selectedDate),
        createdBy: user.currentUser?.uid,
        createdAt: Timestamp.now(),
      });

      setTitle("");
      setDescription("");
      onEventAdded();
    } catch (error) {
      console.error("Error al crear el evento:", error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="font-medium">Agenda del {format(selectedDate, "d 'de' MMMM", { locale: es })}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="Título del evento"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="Descripción"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Button type="submit" className="w-full">
              Agregar Evento
            </Button>
          </div>
        </form>
      </div>

      <div className="space-y-2">
        <h4 className="font-medium">Eventos del día</h4>
        {events?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay eventos para este día</p>
        ) : (
          events?.map((event) => (
            <div key={event.id} className="p-3 bg-slate-50 rounded-md">
              <p className="font-medium">{event.title}</p>
              {event.description && (
                <p className="text-sm text-slate-500 mt-1">{event.description}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
} 