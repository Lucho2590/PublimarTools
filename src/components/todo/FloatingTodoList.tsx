'use client';

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ListTodo, Plus, Trash2, GripVertical } from "lucide-react";
import { Card } from "@/components/ui/card";

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

interface FloatingTodoListProps {
  storageKey: string; // Clave única para localStorage (ej: "banderas-todo", "viaPublica-todo")
}

export default function FloatingTodoList({ storageKey }: FloatingTodoListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodoText, setNewTodoText] = useState("");
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Cargar todos y posición desde localStorage
  useEffect(() => {
    const savedTodos = localStorage.getItem(`${storageKey}-items`);
    const savedPosition = localStorage.getItem(`${storageKey}-position`);

    if (savedTodos) {
      try {
        setTodos(JSON.parse(savedTodos));
      } catch (e) {
        console.error("Error loading todos:", e);
      }
    }

    if (savedPosition) {
      try {
        setPosition(JSON.parse(savedPosition));
      } catch (e) {
        console.error("Error loading position:", e);
      }
    }
  }, [storageKey]);

  // Guardar todos en localStorage
  useEffect(() => {
    if (todos.length > 0 || localStorage.getItem(`${storageKey}-items`)) {
      localStorage.setItem(`${storageKey}-items`, JSON.stringify(todos));
    }
  }, [todos, storageKey]);

  // Guardar posición en localStorage
  useEffect(() => {
    localStorage.setItem(`${storageKey}-position`, JSON.stringify(position));
  }, [position, storageKey]);

  const addTodo = () => {
    if (newTodoText.trim() === "") return;

    const newTodo: TodoItem = {
      id: Date.now().toString(),
      text: newTodoText,
      completed: false,
      createdAt: Date.now(),
    };

    setTodos([...todos, newTodo]);
    setNewTodoText("");
  };

  const toggleTodo = (id: string) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const deleteTodo = (id: string) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Limitar a los bordes de la ventana
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 60;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const incompleteTodos = todos.filter(todo => !todo.completed);
  const completedTodos = todos.filter(todo => todo.completed);

  return (
    <>
      {/* Botón flotante draggable */}
      <button
        ref={buttonRef}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          // Solo abrir el dialog si no se está arrastrando
          if (!isDragging) {
            setIsOpen(true);
          }
        }}
        className={`fixed z-50 bg-blue-900 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all hover:shadow-xl ${
          isDragging ? "cursor-grabbing scale-110" : "cursor-grab"
        }`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
        title="Arrastrar para mover - Click para abrir"
      >
        <div className="relative">
          <ListTodo className="h-6 w-6" />
          {incompleteTodos.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
              {incompleteTodos.length}
            </span>
          )}
        </div>
      </button>

      {/* Modal/Dialog del Todo List */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5" />
              Lista de Tareas
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Input para nueva tarea */}
            <div className="flex gap-2">
              <Input
                placeholder="Nueva tarea..."
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addTodo();
                  }
                }}
              />
              <Button onClick={addTodo} size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Lista de tareas */}
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Tareas pendientes */}
              {incompleteTodos.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-600">
                    Pendientes ({incompleteTodos.length})
                  </h3>
                  {incompleteTodos.map((todo) => (
                    <Card key={todo.id} className="p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={todo.completed}
                          onCheckedChange={() => toggleTodo(todo.id)}
                        />
                        <span className="flex-1 text-sm">{todo.text}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteTodo(todo.id)}
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {/* Tareas completadas */}
              {completedTodos.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-600">
                    Completadas ({completedTodos.length})
                  </h3>
                  {completedTodos.map((todo) => (
                    <Card key={todo.id} className="p-3 bg-gray-50">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={todo.completed}
                          onCheckedChange={() => toggleTodo(todo.id)}
                        />
                        <span className="flex-1 text-sm line-through text-gray-500">
                          {todo.text}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteTodo(todo.id)}
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {/* Estado vacío */}
              {todos.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <ListTodo className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No hay tareas. Agrega una nueva!</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
