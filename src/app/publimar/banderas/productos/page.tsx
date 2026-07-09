'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { softDelete, isDeleted } from '@/lib/softDelete';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import collections from "@/lib/collections";
import { TProduct, TProductCategory, TProductGroup } from "@/types/product";
import { Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
// XLSX se importa dinámicamente en handleDownloadExcel para no cargar ~700KB al inicio
import { formatearPrecio, redondearADecena } from "@/lib/utils";
import ProductEditModal from "./modalProductos/productEditModal";

export default function ProductosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [selectedVariant, setSelectedVariant] = useState<{
    [key: string]: string;
  }>({});
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [increasePercentage, setIncreasePercentage] = useState("");
  const [isApplyingIncrease, setIsApplyingIncrease] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  // Consulta a Firestore para grupos
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

  const { status, data: products } = useFirestoreCollectionData(productsQuery, {
    idField: "id",
  });

  // Filtrar productos según la búsqueda, categoría y grupo (memoizado)
  const filteredProducts = useMemo(() => {
    return products?.filter((product) => {
      if (isDeleted(product)) return false;
      const typedProduct = product as unknown as TProduct;
      const matchesSearch = typedProduct.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesCategory =
        selectedCategory === "all" ||
        (typedProduct.categories &&
          typedProduct.categories.includes(selectedCategory));
      const matchesGroup =
        selectedGroup === "all" ||
        typedProduct.group === selectedGroup ||
        (selectedGroup === "sin-grupo" && !typedProduct.group);
      return matchesSearch && matchesCategory && matchesGroup;
    });
  }, [products, searchTerm, selectedCategory, selectedGroup]);

  // Calcular índices para la paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredProducts?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredProducts?.length || 0) / itemsPerPage);

  // Generar números de página para mostrar
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push(-1); // -1 representa elipsis
        pageNumbers.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pageNumbers.push(1);
        pageNumbers.push(-1);
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pageNumbers.push(i);
        }
      } else {
        pageNumbers.push(1);
        pageNumbers.push(-1);
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push(-1);
        pageNumbers.push(totalPages);
      }
    }
    
    return pageNumbers;
  };

  // Calcular precio con IVA (redondeado hacia arriba a la decena más cercana)
  const calculatePriceWithTax = (price: number, taxRate: number) => {
    const priceWithTax = price * (1 + taxRate / 100);
    return redondearADecena(priceWithTax);
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

  const handleEditProduct = (productId: string) => {
    setSelectedProductId(productId);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProductId(null);
  };

  const handleDeleteProduct = async (productId: string, productName: string) => {
    const confirmDelete = window.confirm(
      `¿Estás seguro de que querés eliminar "${productName}"? Esta acción no se puede deshacer.`
    );

    if (!confirmDelete) return;

    try {
      await softDelete(firestore, collections.PRODUCTS, productId);
      toast.success("Producto eliminado correctamente");
      // Limpiar selección si el producto eliminado estaba seleccionado
      setSelectedProducts(prev => prev.filter(id => id !== productId));
    } catch (error) {
      console.error("Error al eliminar el producto:", error);
      toast.error("Error al eliminar el producto");
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
          const updatedVariants = product.variants.map(variant => {
            const increasedPrice = Number(variant.price) * (1 + percentage);
            const roundedPrice = redondearADecena(increasedPrice);
            return {
              ...variant,
              price: roundedPrice
            };
           
          });

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

  const handleDownloadExcel = async () => {
    if (!filteredProducts) return;

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Crear un mapa de grupos: groupId -> groupName
    const groupMap = new Map<string, string>();
    groups?.forEach((group) => {
      const typedGroup = group as unknown as TProductGroup;
      groupMap.set(typedGroup.id, typedGroup.name);
    });

    // Agrupar productos por grupo
    const productsByGroup = new Map<string, TProduct[]>();

    filteredProducts.forEach((product) => {
      const typedProduct = product as unknown as TProduct;
      const groupId = typedProduct.group || 'sin-grupo';

      if (!productsByGroup.has(groupId)) {
        productsByGroup.set(groupId, []);
      }
      productsByGroup.get(groupId)!.push(typedProduct);
    });

    // Ordenar los grupos alfabéticamente por nombre
    const sortedGroupIds = Array.from(productsByGroup.keys()).sort((a, b) => {
      const nameA = a === 'sin-grupo' ? 'ZZZ' : (groupMap.get(a) || a);
      const nameB = b === 'sin-grupo' ? 'ZZZ' : (groupMap.get(b) || b);
      return nameA.localeCompare(nameB);
    });

    // Crear una hoja por cada grupo
    sortedGroupIds.forEach((groupId) => {
      const productsInGroup = productsByGroup.get(groupId) || [];
      const groupName = groupId === 'sin-grupo' ? 'Sin Grupo' : (groupMap.get(groupId) || 'Grupo Desconocido');

      // Nombre de hoja válido para Excel (max 31 caracteres, sin caracteres especiales)
      const sheetName = groupName.substring(0, 31).replace(/[\\/*?:\[\]]/g, '');

      const data = productsInGroup
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((product) => {
          return product.variants?.map((variant) => ({
            SKU: variant.sku || '-',
            Nombre: product.name,
            Medida: variant.size || '-',
            Precio: Number(variant.price).toFixed(2),
          })) || [];
        });

      if (data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    });

    // Si no hay hojas creadas, crear una vacía
    if (wb.SheetNames.length === 0) {
      const ws = XLSX.utils.json_to_sheet([]);
      XLSX.utils.book_append_sheet(wb, ws, "Productos");
    }

    XLSX.writeFile(wb, "productos.xlsx");
  };

  // console.log(filteredProducts?.[44]);
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
          <Link href="/publimar/banderas/productos/nuevo">
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
              <SelectContent className="max-h-48 overflow-y-auto">
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
            <Select
              value={selectedGroup}
              onValueChange={setSelectedGroup}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por grupo" />
              </SelectTrigger>
              <SelectContent className="max-h-48 overflow-y-auto">
                <SelectItem value="all">Todos los grupos</SelectItem>
                <SelectItem value="sin-grupo">Sin grupo</SelectItem>
                {groups
                  ?.sort((a, b) => {
                    const nameA = (a as unknown as TProductGroup).name;
                    const nameB = (b as unknown as TProductGroup).name;
                    return nameA.localeCompare(nameB);
                  })
                  .map((group) => {
                    const typedGroup = group as unknown as TProductGroup;
                    return (
                      <SelectItem key={typedGroup.id} value={typedGroup.id}>
                        {typedGroup.name}
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
          <div className="p-4 overflow-x-auto">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Mostrar</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    setItemsPerPage(Number(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="10" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-gray-500">por página</span>
              </div>
              <div className="text-sm text-gray-500">
                Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredProducts?.length || 0)} de {filteredProducts?.length || 0} productos
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedProducts.length === filteredProducts?.length}
                      onCheckedChange={handleSelectAll}
                      className="data-[state=checked]:bg-blue-900 data-[state=checked]:border-blue-900"
                    />
                  </TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categorías</TableHead>
                  <TableHead>Medida</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Precio Final</TableHead>
                  {/* <TableHead className="text-right">+ IVA</TableHead> */}
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentItems && currentItems.length > 0 ? (
                  currentItems.map((product) => {
                    const typedProduct = product as unknown as TProduct;
                    const selectedVariant = getSelectedVariant(typedProduct);
                    return (
                      <TableRow key={typedProduct.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedProducts.includes(typedProduct.id)}
                            onCheckedChange={() => handleProductSelection(typedProduct.id)}
                            className="data-[state=checked]:bg-blue-900 data-[state=checked]:border-blue-900"
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {typedProduct.name}
                        </TableCell>
                        <TableCell>
                          {getCategoryNames(typedProduct.categories)}
                        </TableCell>
                        <TableCell >
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
                              <SelectContent className="max-h-48 overflow-y-auto">
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
                        <TableCell className="text-right">
                          {selectedVariant ? (
                            <span
                              className={`${
                                Number(selectedVariant.stock) < 5 ? "text-red-500" : ""
                              }`}
                            >
                              {selectedVariant.stock === Infinity ? "." : selectedVariant.stock}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {selectedVariant ? (
                            <span>{formatearPrecio(Number(selectedVariant.price))}</span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        {/* <TableCell className="text-right">
                          {selectedVariant ? (
                            <span>
                              {formatearPrecio(calculatePriceWithTax(
                                Number(selectedVariant.price),
                                typedProduct.taxRate || 21
                              ))}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell> */}
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              type="button"
                              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                              onClick={() => handleEditProduct(typedProduct.id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Eliminar"
                              type="button"
                              className="bg-red-600 hover:bg-red-700 hover:text-white text-white"
                              onClick={() => handleDeleteProduct(typedProduct.id, typedProduct.name)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    
                    {getPageNumbers().map((pageNumber, index) => (
                      <PaginationItem key={index}>
                        {pageNumber === -1 ? (
                          <PaginationEllipsis />
                        ) : (
                          <PaginationLink
                            onClick={() => setCurrentPage(pageNumber)}
                            isActive={currentPage === pageNumber}
                            className={currentPage === pageNumber ? "bg-blue-900 text-white" : ""}
                          >
                            {pageNumber}
                          </PaginationLink>
                        )}
                      </PaginationItem>
                    ))}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ProductEditModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        productId={selectedProductId}
        onProductUpdated={() => {
          // The real-time data will automatically update the list
        }}
      />
    </div>
  );
}
