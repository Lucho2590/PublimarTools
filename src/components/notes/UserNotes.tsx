'use client';

import { useState, useEffect } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  collection,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Plus, Trash2, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import collections from "@/lib/collections";
import { ENoteSection, TNote } from "@/types/note";
import { toast } from "sonner";

interface UserNotesProps {
  userId: string;
  userName: string;
  section: ENoteSection;
}

export default function UserNotes({ userId, userName, section }: UserNotesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [editingNote, setEditingNote] = useState<{ id: string; content: string } | null>(null);
  const firestore = useFirestore();

  // Consulta TODAS las notas de esta sección (colaborativo)
  const notesCollection = collection(firestore, collections.NOTES);
  const notesQuery = query(
    notesCollection,
    where("section", "==", section)
  );

  const { data: notes, status } = useFirestoreCollectionData(notesQuery, {
    idField: "id",
  });

  const addNote = async () => {
    if (newNoteContent.trim() === "") {
      toast.error("La nota no puede estar vacía");
      return;
    }

    try {
      await addDoc(collection(firestore, collections.NOTES), {
        userId,
        userName,
        section,
        content: newNoteContent,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      setNewNoteContent("");
      toast.success("Nota agregada");
    } catch (error) {
      console.error("Error adding note:", error);
      toast.error("Error al agregar la nota");
    }
  };

  const updateNote = async () => {
    if (!editingNote || editingNote.content.trim() === "") {
      toast.error("La nota no puede estar vacía");
      return;
    }

    try {
      const noteRef = doc(firestore, collections.NOTES, editingNote.id);
      await updateDoc(noteRef, {
        content: editingNote.content,
        updatedAt: Timestamp.now(),
      });

      setEditingNote(null);
      toast.success("Nota actualizada");
    } catch (error) {
      console.error("Error updating note:", error);
      toast.error("Error al actualizar la nota");
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      await deleteDoc(doc(firestore, collections.NOTES, noteId));
      toast.success("Nota eliminada");
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error("Error al eliminar la nota");
    }
  };

  const startEditing = (note: any) => {
    setEditingNote({ id: note.id, content: note.content });
  };

  const cancelEditing = () => {
    setEditingNote(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center gap-2 bg-blue-900 hover:bg-blue-700 text-white hover:text-white"
        >
          <StickyNote className="h-4 w-4" />
          Notas
          {notes && notes.length > 0 && (
            <span className="ml-1 bg-red-700 text-white text-xs rounded-full px-2 py-0.5">
              {notes.length}
            </span>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5" />
            Mis Notas - {section === ENoteSection.BANDERAS ? "Banderas" : "Vía Pública"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Textarea para nueva nota */}
          <div className="space-y-2">
            <Textarea
              placeholder="Escribe una nueva nota..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              className="min-h-[80px] shadow-none"
            />
            <Button onClick={addNote} className="w-full bg-blue-900 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Agregar Nota
            </Button>
          </div>

          {/* Lista de notas */}
          <div className="flex-1 overflow-y-auto space-y-3">
            {status === "loading" ? (
              <div className="text-center py-8 text-gray-400">
                Cargando notas...
              </div>
            ) : notes && notes.length > 0 ? (
              notes.map((note: any) => (
                <Card key={note.id} className="p-4">
                  {editingNote?.id === note.id ? (
                    // Modo edición
                    <div className="space-y-2">
                      <Textarea
                        value={editingNote.content}
                        onChange={(e) =>
                          setEditingNote({ ...editingNote, content: e.target.value })
                        }
                        className="min-h-[80px] shadow-none"
                      />
                      <div className="flex gap-2">
                        <Button onClick={updateNote} size="sm" className="flex-1 bg-blue-900 hover:bg-blue-700">
                          Guardar
                        </Button>
                        <Button
                          onClick={cancelEditing}
                          size="sm"
                          variant="outline"
                          className="flex-1 hover:bg-slate-100"
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Modo visualización
                    <div className="space-y-2">
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <div className="flex flex-col">
                          <span className="font-semibold text-blue-600">
                            {note.userName || "Usuario"}
                          </span>
                          <span>
                            {note.updatedAt?.toDate?.()
                              ? new Date(note.updatedAt.toDate()).toLocaleDateString("es-AR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : ""}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(note)}
                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteNote(note.id)}
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-gray-400">
                <StickyNote className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No tienes notas. Agrega una nueva!</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
