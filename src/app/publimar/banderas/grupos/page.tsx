'use client';

import { useState } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { softDelete } from '@/lib/softDelete';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import collections from "@/lib/collections";
import { Trash2, Edit } from "lucide-react";
import { TProductGroup } from "@/types/product";

export default function GruposPage() {
  const [newGroup, setNewGroup] = useState({ name: "", description: "" });
  const [editingGroup, setEditingGroup] = useState<{
    id: string;
    name: string;
    description: string;
  } | null>(null);
  const firestore = useFirestore();

  const groupsCollection = collection(
    firestore,
    collections.products.GROUPS
  );
  const { data: groups } = useFirestoreCollectionData(
    groupsCollection,
    {
      idField: "id",
    }
  );

  const handleAddGroup = async () => {
    if (!newGroup.name.trim()) {
      toast.error("El nombre del grupo no puede estar vacío");
      return;
    }

    try {
      await addDoc(groupsCollection, {
        name: newGroup.name.trim(),
        description: newGroup.description.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewGroup({ name: "", description: "" });
      toast.success("Grupo creado con éxito");
    } catch (error) {
      console.error("Error al crear el grupo:", error);
      toast.error("Error al crear el grupo");
    }
  };

  const handleEditGroup = async () => {
    if (!editingGroup?.name.trim()) {
      toast.error("El nombre del grupo no puede estar vacío");
      return;
    }

    try {
      const groupRef = doc(
        firestore,
        collections.products.GROUPS,
        editingGroup.id
      );
      await updateDoc(groupRef, {
        name: editingGroup.name.trim(),
        description: editingGroup.description.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditingGroup(null);
      toast.success("Grupo actualizado con éxito");
    } catch (error) {
      console.error("Error al actualizar el grupo:", error);
      toast.error("Error al actualizar el grupo");
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este grupo?")) {
      return;
    }

    try {
      await softDelete(firestore, collections.products.GROUPS, groupId);
      toast.success("Grupo eliminado con éxito");
    } catch (error) {
      console.error("Error al eliminar el grupo:", error);
      toast.error("Error al eliminar el grupo");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Grupos de Productos</h1>
        <Button
          asChild
          variant="outline"
        >
          <Link href="/publimar/banderas/productos">Volver a Productos</Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            {editingGroup ? "Editar Grupo" : "Nuevo Grupo"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="groupName">Nombre del grupo</Label>
              <Input
                id="groupName"
                value={editingGroup ? editingGroup.name : newGroup.name}
                onChange={(e) =>
                  editingGroup
                    ? setEditingGroup({
                        ...editingGroup,
                        name: e.target.value,
                      })
                    : setNewGroup({ ...newGroup, name: e.target.value })
                }
                placeholder="Ej: Banderas Deportivas"
              />
            </div>
            <div>
              <Label htmlFor="groupDescription">Descripción (opcional)</Label>
              <Textarea
                id="groupDescription"
                value={editingGroup ? editingGroup.description : newGroup.description}
                onChange={(e) =>
                  editingGroup
                    ? setEditingGroup({
                        ...editingGroup,
                        description: e.target.value,
                      })
                    : setNewGroup({ ...newGroup, description: e.target.value })
                }
                placeholder="Descripción del grupo..."
                rows={2}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          {editingGroup ? (
            <>
              <Button onClick={handleEditGroup} className="mr-2 bg-blue-900 hover:bg-blue-700">
                Guardar Cambios
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditingGroup(null)}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <Button onClick={handleAddGroup} className="bg-blue-900 hover:bg-blue-700">
              Agregar Grupo
            </Button>
          )}
        </CardFooter>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-10">Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="pr-10 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups
                ?.sort((a, b) => a.name.localeCompare(b.name))
                ?.map((group) => {
                const typedGroup = group as unknown as TProductGroup;
                return (
                  <TableRow key={typedGroup.id}>
                    <TableCell className="pl-10 font-medium">{typedGroup.name}</TableCell>
                    <TableCell className="text-gray-500">{typedGroup.description || "-"}</TableCell>
                    <TableCell className="pr-8 text-right">
                      <Button
                        onClick={() =>
                          setEditingGroup({
                            id: typedGroup.id,
                            name: typedGroup.name,
                            description: typedGroup.description || "",
                          })
                        }
                        variant="ghost"
                        size="icon"
                        title="Editar"
                        className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteGroup(typedGroup.id)}
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 ml-2"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!groups || groups.length === 0) && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                    No hay grupos creados. Crea el primero arriba.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
