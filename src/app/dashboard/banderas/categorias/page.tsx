"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";
import collections from "~/lib/collections";
import { TProductCategory } from "~/types/product";
import { Trash2, Edit } from "lucide-react";

export default function CategoriasPage() {
  const [newCategory, setNewCategory] = useState("");
  const [editingCategory, setEditingCategory] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const router = useRouter();
  const firestore = useFirestore();

  const categoriesCollection = collection(
    firestore,
    collections.products.CATEGORIES
  );
  const { data: categories } = useFirestoreCollectionData(
    categoriesCollection,
    {
      idField: "id",
    }
  );

  const handleAddCategory = async () => {
    if (!newCategory.trim()) {
      toast.error("El nombre de la categoría no puede estar vacío");
      return;
    }

    try {
      await addDoc(categoriesCollection, {
        name: newCategory.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewCategory("");
      toast.success("Categoría creada con éxito");
    } catch (error) {
      console.error("Error al crear la categoría:", error);
      toast.error("Error al crear la categoría");
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory?.name.trim()) {
      toast.error("El nombre de la categoría no puede estar vacío");
      return;
    }

    try {
      const categoryRef = doc(
        firestore,
        collections.products.CATEGORIES,
        editingCategory.id
      );
      await updateDoc(categoryRef, {
        name: editingCategory.name.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditingCategory(null);
      toast.success("Categoría actualizada con éxito");
    } catch (error) {
      console.error("Error al actualizar la categoría:", error);
      toast.error("Error al actualizar la categoría");
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar esta categoría?")) {
      return;
    }

    try {
      const categoryRef = doc(
        firestore,
        collections.products.CATEGORIES,
        categoryId
      );
      await deleteDoc(categoryRef);
      toast.success("Categoría eliminada con éxito");
    } catch (error) {
      console.error("Error al eliminar la categoría:", error);
      toast.error("Error al eliminar la categoría");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Categorías</h1>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/banderas/productos")}
        >
          Volver a Productos
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            {editingCategory ? "Editar Categoría" : "Nueva Categoría"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="categoryName">Nombre de la categoría</Label>
              <Input
                id="categoryName"
                value={editingCategory ? editingCategory.name : newCategory}
                onChange={(e) =>
                  editingCategory
                    ? setEditingCategory({
                        ...editingCategory,
                        name: e.target.value,
                      })
                    : setNewCategory(e.target.value)
                }
                placeholder="Ej: Bandera Nacional"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          {editingCategory ? (
            <>
              <Button onClick={handleEditCategory} className="mr-2">
                Guardar Cambios
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditingCategory(null)}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <Button onClick={handleAddCategory}>Agregar Categoría</Button>
          )}
        </CardFooter>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories?.map((category) => {
                const typedCategory = category as unknown as TProductCategory;
                return (
                  <TableRow key={typedCategory.id}>
                    <TableCell>{typedCategory.name}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() =>
                          setEditingCategory({
                            id: typedCategory.id,
                            name: typedCategory.name,
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
                        onClick={() => handleDeleteCategory(typedCategory.id)}
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
