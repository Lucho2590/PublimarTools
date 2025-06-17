'use client';

import { useState, useEffect, useCallback } from "react";
import { useFirestore, useFirestoreDoc, useFirestoreCollectionData } from "reactfire";
import { collection, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import collections from "@/lib/collections";
import { TProduct, TProductCategory, TProductVariant } from "@/types/product";
import { Trash2 } from "lucide-react";

interface ProductEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string | null;
  onProductUpdated?: () => void;
}

export default function ProductEditModal({
  isOpen,
  onClose,
  productId,
  onProductUpdated,
}: ProductEditModalProps) {
  const [loading, setLoading] = useState(false);
  const firestore = useFirestore();

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

  // Reset function (stable reference)
  const resetModalState = useCallback(() => {
    setLoading(false);
    setFormData({
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
  }, []);

  // Obtener categorías
  const categoriesCollection = collection(
    firestore,
    collections.products.CATEGORIES
  );
  const { data: categories } = useFirestoreCollectionData(categoriesCollection, {
    idField: "id",
  });

  // Obtener el producto a editar
  const productRef = productId ? doc(firestore, collections.PRODUCTS, productId) : null;
  const { status: productStatus, data: productData } = useFirestoreDoc(
    productRef || doc(firestore, collections.PRODUCTS, "dummy"),
    { idField: "id" }
  );

  // Reset al cerrar modal
  useEffect(() => {
    if (!isOpen) {
      resetModalState();
      return;
    }

    if (productData && productId && productStatus === "success") {
      // Check if productData has data() method (DocumentSnapshot) or is already the data
      const product = typeof productData.data === 'function' 
        ? productData.data() as unknown as TProduct
        : productData as unknown as TProduct;
      
      if (product) {
        setFormData({
          name: product.name || "",
          description: product.description || "",
          categories: Array.isArray(product.categories) ? product.categories : [],
          imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls : [],
          hasVariants: true,
          price: "",
          stock: "",
          sku: product.sku || "",
          taxRate: product.taxRate || 21,
          size: "",
          variants: Array.isArray(product.variants) && product.variants.length > 0 
            ? product.variants.map(variant => ({
                ...variant,
                price: variant.price.toString(),
                stock: variant.stock.toString(),
              }))
            : [{
                id: crypto.randomUUID(),
                size: "",
                price: "",
                stock: "",
              }],
        });
      }
    }
  }, [isOpen, productData, productId, productStatus, resetModalState]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCategoryChange = (categoryId: string) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.includes(categoryId)
        ? prev.categories.filter((id) => id !== categoryId)
        : [...prev.categories, categoryId],
    }));
  };

  const handleRemoveVariant = (variantId: string) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.filter((v) => v.id !== variantId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productRef) return;

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
        imageUrls: formData.imageUrls,
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
        updatedAt: serverTimestamp(),
      };

      await updateDoc(productRef, productData);
      toast.success("Producto actualizado con éxito");
      onProductUpdated?.();
      onClose();
    } catch (error) {
      console.error("Error al actualizar el producto:", error);
      toast.error("Error al actualizar el producto");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !productId) return null;

  if (productStatus === "loading" && productId) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (productStatus === "success" && !productData && productId) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-slate-900">
              Producto no encontrado
            </h2>
            <p className="mt-2 text-slate-600">
              El producto que buscas no existe o ha sido eliminado.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex justify-between items-center">
            <span>Editar producto: {formData.name}</span>
            <div className="flex gap-2">
              <Button
                className="bg-red-500 hover:bg-red-600 text-white"
                variant="outline"
                onClick={onClose}
              >
                Cancelar
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

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
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2 pt-4">
          <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              type="submit"
              disabled={loading}
            >
              {loading ? "Guardando..." : "Guardar cambios"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Cancelar
            </Button>
        
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
} 