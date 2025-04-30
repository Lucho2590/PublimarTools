"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { toast } from "sonner";
import collections from "~/lib/collections";
import { TProduct, TProductCategory, TProductVariant } from "~/types/product";
import { Trash2 } from "lucide-react";

export default function NuevoProductoPage() {
  const [loading, setLoading] = useState(false);
  const [hasVariants, setHasVariants] = useState(true);
  const router = useRouter();
  const firestore = useFirestore();

  // Obtener categorías
  const categoriesCollection = collection(
    firestore,
    collections.products.CATEGORIES
  );
  const { data: categories } = useFirestoreCollectionData(categoriesCollection, {
    idField: "id",
  });

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    categories: [] as string[],
    imageUrls: [] as string[],
    hasVariants: true,
    price: "",
    stock: "",
    sku: "",
    taxRate: 21,
    size: "",
    variants: [{
      id: crypto.randomUUID(),
      size: "",
      price: "",
      stock: "",
    }] as TProductVariant[],
  });

  const [currentVariant, setCurrentVariant] = useState({
    size: "",
    price: "",
    stock: "",
    sku: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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

  const handleCategoryChange = (categoryId: string) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.includes(categoryId)
        ? prev.categories.filter((id) => id !== categoryId)
        : [...prev.categories, categoryId],
    }));
  };

  const handleVariantChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setCurrentVariant((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddVariant = () => {
    if (!currentVariant.size || !currentVariant.price || !currentVariant.stock) {
      toast.error("Por favor complete todos los campos de la variante");
      return;
    }

    const newVariant: TProductVariant = {
      id: crypto.randomUUID(),
      size: currentVariant.size,
      price: parseFloat(currentVariant.price),
      stock: parseInt(currentVariant.stock),
      sku: currentVariant.sku || undefined,
    };

    setFormData((prev) => ({
      ...prev,
      variants: [...prev.variants, newVariant],
    }));

    setCurrentVariant({
      size: "",
      price: "",
      stock: "",
      sku: "",
    });
  };

  const handleRemoveVariant = (variantId: string) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.filter((v) => v.id !== variantId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validar que haya al menos una variante
      if (formData.variants.length === 0) {
        toast.error("Debe agregar al menos una variante al producto");
        setLoading(false);
        return;
      }

      // Validar que todas las variantes tengan los campos requeridos
      const invalidVariants = formData.variants.filter(
        (variant) => !variant.size || !variant.price || !variant.stock
      );
      if (invalidVariants.length > 0) {
        toast.error("Todas las variantes deben tener medida, precio y stock");
        setLoading(false);
        return;
      }

      const productData = {
        name: formData.name || "",
        description: formData.description || "",
        categories: formData.categories || [],
        imageUrls: [],
        hasVariants: true,
        price: null,
        stock: null,
        sku: formData.sku || "",
        taxRate: formData.taxRate || 21,
        size: "",
        variants: formData.variants.map(variant => ({
          id: variant.id,
          size: variant.size,
          price: parseFloat(String(variant.price)) || 0,
          stock: parseInt(String(variant.stock)) || 0,
          sku: variant.sku || ""
        })),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Debug: Imprimir los datos antes de guardar
      console.log("Datos a guardar:", JSON.stringify(productData, null, 2));

      const productsCollection = collection(firestore, collections.PRODUCTS);
      await addDoc(productsCollection, productData);

      toast.success("Producto creado con éxito");
      router.push("/dashboard/banderas/productos");
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/banderas/categorias")}
            className="bg-blue-900 hover:bg-blue-900 hover:text-white  text-white"
          >
            Gestionar Categorías
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/banderas/productos")}
            className="bg-blue-900 hover:bg-blue-900 hover:text-white  text-white"
          >
            Cancelar
          </Button>
        </div>
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

            <div className="space-y-2">
              <Label>Categorías</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {categories?.map((category) => {
                  const typedCategory = category as unknown as TProductCategory;
                  return (
                    <div key={typedCategory.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`category-${typedCategory.id}`}
                        checked={Array.isArray(formData.categories) && formData.categories.includes(typedCategory.id)}
                        onChange={() => handleCategoryChange(typedCategory.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-blue-300 rounded"
                      />
                      <Label htmlFor={`category-${typedCategory.id}`}>
                        {typedCategory.name}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxRate">Porcentaje de IVA</Label>
              <Input
                id="taxRate"
                name="taxRate"
                type="number"
                min="0"
                max="100"
                value={formData.taxRate}
                onChange={handleChange}
                required
              />
            </div>

            {/* <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="hasVariants"
                name="hasVariants"
                checked={formData.hasVariants}
                onChange={handleCheckboxChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-blue-300 rounded"
              />
              <Label htmlFor="hasVariants">
                Este producto tiene variantes (tallas, medidas, etc.)
              </Label>
            </div> */}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Variantes del producto</CardTitle>
            <Button
              type="button"
              onClick={() => {
                const newVariant: TProductVariant = {
                  id: crypto.randomUUID(),
                  size: "",
                  price: "",
                  stock: "",
                };
                setFormData((prev) => ({
                  ...prev,
                  variants: [...prev.variants, newVariant],
                }));
              }}
              size="sm"
              className="bg-blue-900 hover:bg-blue-900 hover:text-white text-white"
            >
              +
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              {formData.variants.map((variant, index) => (
                <div key={variant.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <Input
                      value={variant.size}
                      onChange={(e) => {
                        const newVariants = [...formData.variants];
                        newVariants[index] = {
                          ...variant,
                          size: e.target.value,
                        };
                        setFormData((prev) => ({
                          ...prev,
                          variants: newVariants,
                        }));
                      }}
                      placeholder="Medida (Ej: 1.5m x 1m)"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-500">
                        $
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={variant.price}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index] = {
                            ...variant,
                            price: e.target.value,
                          };
                          setFormData((prev) => ({
                            ...prev,
                            variants: newVariants,
                          }));
                        }}
                        className="pl-8"
                        placeholder="Precio"
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="0"
                      value={variant.stock}
                      onChange={(e) => {
                        const newVariants = [...formData.variants];
                        newVariants[index] = {
                          ...variant,
                          stock: e.target.value,
                        };
                        setFormData((prev) => ({
                          ...prev,
                          variants: newVariants,
                        }));
                      }}
                      placeholder="Stock"
                    />
                  </div>
                  {formData.variants.length > 1 && (
                    <Button
                    onClick={() => handleRemoveVariant(variant.id)}
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Imágenes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-blue-300 rounded-md p-6 text-center">
              <p className="text-blue-500">
                La subida de imágenes no está implementada en esta versión.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardFooter className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/banderas/productos")}
              disabled={loading}
              className="bg-blue-900 hover:bg-blue-900 hover:text-white  text-white"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-900 hover:bg-blue-900 hover:text-white  text-white">
              {loading ? "Guardando..." : "Guardar producto"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
