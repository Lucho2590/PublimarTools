"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFirestore } from "reactfire";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";
import collections from "~/lib/collections";
import { EProductCategory, EProductStatus, TProduct } from "~/types/product";

export default function NuevoProductoPage() {
  const [loading, setLoading] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const router = useRouter();
  const firestore = useFirestore();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: EProductCategory.NATIONAL_FLAG,
    status: EProductStatus.ACTIVE,
    imageUrls: [],
    hasVariants: false,
    price: "",
    stock: "",
    sku: "",
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: checked,
    }));

    if (name === "hasVariants") {
      setHasVariants(checked);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Crear un nuevo producto en Firestore
      const productData = {
        ...formData,
        price: hasVariants ? null : parseFloat(formData.price),
        stock: hasVariants ? null : parseInt(formData.stock),
        imageUrls: [], // En una implementación completa, aquí se subirían imágenes y se guardarían las URLs
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Eliminar campos nulos o vacíos
      Object.keys(productData).forEach((key) => {
        if (productData[key] === null || productData[key] === "") {
          delete productData[key];
        }
      });

      const productsCollection = collection(firestore, collections.PRODUCTS);
      await addDoc(productsCollection, productData);

      toast.success("Producto creado con éxito");
      router.push("/dashboard/productos");
    } catch (error) {
      console.error("Error al crear el producto:", error);
      toast.error("Error al crear el producto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Crear nuevo producto</h1>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/productos")}
        >
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Información básica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Categoría</Label>
                <select
                  id="category"
                  name="category"
                  className="w-full p-2 border border-slate-300 rounded-md"
                  value={formData.category}
                  onChange={handleChange}
                  required
                >
                  <option value={EProductCategory.NATIONAL_FLAG}>
                    Bandera Nacional
                  </option>
                  <option value={EProductCategory.CUSTOM_FLAG}>
                    Bandera Personalizada
                  </option>
                  <option value={EProductCategory.ACCESSORY}>Accesorio</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Estado</Label>
                <select
                  id="status"
                  name="status"
                  className="w-full p-2 border border-slate-300 rounded-md"
                  value={formData.status}
                  onChange={handleChange}
                  required
                >
                  <option value={EProductStatus.ACTIVE}>Activo</option>
                  <option value={EProductStatus.INACTIVE}>Inactivo</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="hasVariants"
                name="hasVariants"
                checked={formData.hasVariants}
                onChange={handleCheckboxChange}
                className="h-4 w-4 text-slate-600 focus:ring-slate-500 border-slate-300 rounded"
              />
              <Label htmlFor="hasVariants">
                Este producto tiene variantes (tallas, medidas, etc.)
              </Label>
            </div>
          </CardContent>
        </Card>

        {!hasVariants && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Precio y stock</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Precio</Label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                      $
                    </span>
                    <Input
                      id="price"
                      name="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price}
                      onChange={handleChange}
                      className="pl-8"
                      required={!hasVariants}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stock">Stock</Label>
                  <Input
                    id="stock"
                    name="stock"
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={handleChange}
                    required={!hasVariants}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Imágenes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-slate-300 rounded-md p-6 text-center">
              <p className="text-slate-500">
                La subida de imágenes no está implementada en esta versión.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardFooter className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/productos")}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Guardar producto"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
