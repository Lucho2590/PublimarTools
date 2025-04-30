"use client";

import { useState } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import collections from "~/lib/collections";
import { TProduct, TProductCategory } from "~/types/product";
import { Edit } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from 'xlsx';

export default function ProductosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedVariant, setSelectedVariant] = useState<{
    [key: string]: string;
  }>({});
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [increasePercentage, setIncreasePercentage] = useState("");
  const [isApplyingIncrease, setIsApplyingIncrease] = useState(false);
  const firestore = useFirestore();

  // Consulta a Firestore para productos
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const productsQuery = query(productsCollection, orderBy("name"));

  // Consulta a Firestore para categorías
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

  const { status, data: products } = useFirestoreCollectionData(productsQuery, {
    idField: "id",
  });

  // Filtrar productos según la búsqueda y categoría
  const filteredProducts = products?.filter((product) => {
    const typedProduct = product as unknown as TProduct;
    const matchesSearch = typedProduct.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" ||
      (typedProduct.categories &&
        typedProduct.categories.includes(selectedCategory));
    return matchesSearch && matchesCategory;
  });

  // Calcular precio con IVA
  const calculatePriceWithTax = (price: number, taxRate: number) => {
    return price * (1 + taxRate / 100);
  };

  // Obtener nombres de categorías
  const getCategoryNames = (categoryIds: string[] | undefined) => {
    if (!categoryIds || !Array.isArray(categoryIds)) {
      return "-";
    }
    return (
      categoryIds
        .map((id) => {
          const category = categories?.find(
            (c) => (c as unknown as TProductCategory).id === id
          );
          return category ? (category as unknown as TProductCategory).name : "";
        })
        .filter(Boolean)
        .join(", ") || "-"
    );
  };

  // Obtener todas las medidas únicas de los productos
  const getAllSizes = () => {
    const sizes = new Set<string>();
    products?.forEach((product) => {
      const typedProduct = product as unknown as TProduct;
      if (typedProduct.variants) {
        typedProduct.variants.forEach((variant) => {
          if (variant.size) {
            sizes.add(variant.size);
          }
        });
      }
    });
    return Array.from(sizes).sort();
  };

  // Obtener la variante seleccionada para un producto
  const getSelectedVariant = (product: TProduct) => {
    if (!product.variants || product.variants.length === 0) return null;
    const selectedSize = selectedVariant[product.id];
    if (selectedSize) {
      return product.variants.find((v) => v.size === selectedSize);
    }
    return product.variants[0];
  };

  const handleProductSelection = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSelectAll = () => {
    if (selectedProducts.length === filteredProducts?.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts?.map(p => (p as unknown as TProduct).id) || []);
    }
  };

  const handleApplyIncrease = async () => {
    if (!increasePercentage || isNaN(Number(increasePercentage))) {
      toast.error("Por favor ingrese un porcentaje válido");
      return;
    }

    if (selectedProducts.length === 0) {
      toast.error("Por favor seleccione al menos un producto");
      return;
    }

    setIsApplyingIncrease(true);
    const percentage = Number(increasePercentage) / 100;

    try {
      for (const productId of selectedProducts) {
        const product = products?.find(p => (p as unknown as TProduct).id === productId) as unknown as TProduct;
        if (product && product.variants) {
          const updatedVariants = product.variants.map(variant => ({
            ...variant,
            price: Number(variant.price) * (1 + percentage)
          }));

          await updateDoc(doc(firestore, collections.PRODUCTS, productId), {
            variants: updatedVariants,
            updatedAt: serverTimestamp()
          });
        }
      }
      toast.success(`Aumento del ${increasePercentage}% aplicado a ${selectedProducts.length} productos`);
      setIncreasePercentage("");
      setSelectedProducts([]);
    } catch (error) {
      console.error("Error al aplicar el aumento:", error);
      toast.error("Error al aplicar el aumento");
    } finally {
      setIsApplyingIncrease(false);
    }
  };

  const handleDownloadExcel = () => {
    if (!filteredProducts) return;

    const data = filteredProducts.flatMap((product) => {
      const typedProduct = product as unknown as TProduct;
      return typedProduct.variants?.map((variant) => ({
        SKU: variant.sku || '-',
        Nombre: typedProduct.name,
        Medida: variant.size || '-',
        Precio: Number(variant.price).toFixed(2),
        'Precio con IVA': calculatePriceWithTax(Number(variant.price), typedProduct.taxRate).toFixed(2)
      })) || [];
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "productos.xlsx");
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Productos</h1>
        <div className="flex gap-2">
          <Button 
            onClick={handleDownloadExcel}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            Descargar Excel
          </Button>
          <Link href="/dashboard/banderas/productos/nuevo">
            <Button className="bg-blue-900 hover:bg-blue-900 hover:text-white">
              Nuevo Producto
            </Button>
          </Link>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <Input
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories?.map((category) => {
                  const typedCategory = category as unknown as TProductCategory;
                  return (
                    <SelectItem key={typedCategory.id} value={typedCategory.id}>
                      {typedCategory.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 ml-auto">
              <Input
                type="number"
                placeholder="% Aumento"
                value={increasePercentage}
                onChange={(e) => setIncreasePercentage(e.target.value)}
                className="w-24"
              />
              <Button
                onClick={handleApplyIncrease}
                disabled={isApplyingIncrease || selectedProducts.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isApplyingIncrease ? "Aplicando..." : "Aplicar Aumento"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <input
                    type="checkbox"
                    checked={selectedProducts.length === filteredProducts?.length}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-blue-300 rounded"
                  />
                </TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categorías</TableHead>
                <TableHead>Medida</TableHead>
                {/* <TableHead>SKU</TableHead> */}
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">+ IVA</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts && filteredProducts.length > 0 ? (
                filteredProducts.map((product) => {
                  const typedProduct = product as unknown as TProduct;
                  const selectedVariant = getSelectedVariant(typedProduct);
                  return (
                    <TableRow key={typedProduct.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(typedProduct.id)}
                          onChange={() => handleProductSelection(typedProduct.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-blue-300 rounded"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {typedProduct.name}
                      </TableCell>
                      <TableCell>
                        {getCategoryNames(typedProduct.categories)}
                      </TableCell>
                      <TableCell>
                        {typedProduct.variants &&
                        typedProduct.variants.length > 0 ? (
                          <Select
                            value={selectedVariant?.size || ""}
                            onValueChange={(value) => {
                              setSelectedVariant((prev) => ({
                                ...prev,
                                [typedProduct.id]: value,
                              }));
                            }}
                          >
                            <SelectTrigger className="w-[150px]">
                              <SelectValue placeholder="Seleccionar medida" />
                            </SelectTrigger>
                            <SelectContent>
                              {typedProduct.variants.map((variant) => (
                                <SelectItem
                                  key={variant.id}
                                  value={variant.size}
                                >
                                  {variant.size}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      {/* <TableCell>{typedProduct.sku || "-"}</TableCell> */}
                      <TableCell className="text-right">
                        {selectedVariant ? (
                          <span
                            className={`${
                              Number(selectedVariant.stock) < 5 ? "text-red-500" : ""
                            }`}
                          >
                            {selectedVariant.stock}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {selectedVariant ? (
                          <span>${Number(selectedVariant.price).toFixed(2)}</span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {selectedVariant ? (
                          <span>
                            $
                            {calculatePriceWithTax(
                              Number(selectedVariant.price),
                              typedProduct.taxRate
                            ).toFixed(2)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Link
                          href={`/dashboard/banderas/productos/${typedProduct.id}/editar`}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar"
                            className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-blue-500 py-4"
                  >
                    No se encontraron productos
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
