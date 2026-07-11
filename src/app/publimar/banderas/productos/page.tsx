'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { softDelete, isDeleted } from '@/lib/softDelete';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { TablePagination } from "@/components/admin/TablePagination";
import collections from "@/lib/collections";
import { TProduct, TProductCategory, TProductGroup } from "@/types/product";
import { Edit, Trash2, Download, Plus, Package, AlertTriangle, PackageX, Search, MoreVertical } from "lucide-react";
import { toast } from "sonner";
// XLSX se importa dinámicamente en handleDownloadExcel para no cargar ~700KB al inicio
import { cn, formatearPrecio, redondearADecena, redondearPrecio } from "@/lib/utils";
import { getRoundingConfig } from "@/lib/pricingConfig";
import { recordPriceChanges } from "@/lib/priceHistory";
import { EPriceChangeSource, TPriceChangeInput } from "@/types/priceHistory";
import { useAuditLog } from "@/hooks/useAuditLog";
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
  const { actor } = useAuditLog();

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

  // KPIs de resumen sobre los productos filtrados (respeta soft delete y filtros
  // activos). Criterio de stock alineado con el de la tabla: stock < 5 = bajo,
  // Infinity = ilimitado (no cuenta como bajo ni sin stock).
  const stats = useMemo(() => {
    const list = (filteredProducts ?? []).map(
      (p) => p as unknown as TProduct
    );
    let lowStock = 0;
    let outOfStock = 0;

    for (const product of list) {
      const variants = product.variants ?? [];
      if (variants.length === 0) continue;

      const finiteStocks = variants
        .map((v) => Number(v.stock))
        .filter((s) => Number.isFinite(s));

      // Sin stock: todas las variantes con stock finito están en 0.
      if (finiteStocks.length > 0 && finiteStocks.every((s) => s === 0)) {
        outOfStock++;
      }
      // Stock bajo: alguna variante con stock finito < 5.
      if (finiteStocks.some((s) => s < 5)) {
        lowStock++;
      }
    }

    return { total: list.length, lowStock, outOfStock };
  }, [filteredProducts]);

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
      // Config global de redondeo (editable desde /sudo). Fallback: decena.
      const roundingConfig = await getRoundingConfig(firestore);
      const priceChanges: TPriceChangeInput[] = [];

      for (const productId of selectedProducts) {
        const product = products?.find(p => (p as unknown as TProduct).id === productId) as unknown as TProduct;
        if (product && product.variants) {
          const updatedVariants = product.variants.map(variant => {
            const oldPrice = Number(variant.price);
            const increasedPrice = oldPrice * (1 + percentage);
            const roundedPrice = redondearPrecio(increasedPrice, roundingConfig);
            priceChanges.push({
              productId,
              productName: product.name,
              variantId: variant.id ?? null,
              variantSize: variant.size ?? null,
              oldPrice,
              newPrice: roundedPrice,
            });
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

      // Registrar el historial de cambios de precio (un lote).
      await recordPriceChanges(
        firestore,
        actor,
        priceChanges,
        EPriceChangeSource.AUMENTO
      );

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
    if (!products) return;

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Exportar TODOS los productos activos (no solo los filtrados en pantalla)
    const activeProducts = products
      .filter((product) => !isDeleted(product))
      .map((product) => product as unknown as TProduct);

    // Crear un mapa de grupos: groupId -> groupName
    const groupMap = new Map<string, string>();
    groups?.forEach((group) => {
      const typedGroup = group as unknown as TProductGroup;
      groupMap.set(typedGroup.id, typedGroup.name);
    });

    // Agrupar productos por grupo
    const productsByGroup = new Map<string, TProduct[]>();

    activeProducts.forEach((typedProduct) => {
      const groupId = typedProduct.group || 'sin-grupo';

      if (!productsByGroup.has(groupId)) {
        productsByGroup.set(groupId, []);
      }
      productsByGroup.get(groupId)!.push(typedProduct);
    });

    // Ordenar los grupos alfabéticamente por nombre ("Sin Grupo" al final)
    const sortedGroupIds = Array.from(productsByGroup.keys()).sort((a, b) => {
      const nameA = a === 'sin-grupo' ? 'ZZZ' : (groupMap.get(a) || a);
      const nameB = b === 'sin-grupo' ? 'ZZZ' : (groupMap.get(b) || b);
      return nameA.localeCompare(nameB);
    });

    // Evitar nombres de hoja duplicados (Excel no lo permite)
    const usedSheetNames = new Set<string>();
    const makeUniqueSheetName = (name: string) => {
      let candidate = name || "Hoja";
      let suffix = 2;
      while (usedSheetNames.has(candidate.toLowerCase())) {
        const tag = ` (${suffix})`;
        candidate = `${name.substring(0, 31 - tag.length)}${tag}`;
        suffix++;
      }
      usedSheetNames.add(candidate.toLowerCase());
      return candidate;
    };

    // Crear una hoja por cada grupo
    sortedGroupIds.forEach((groupId) => {
      const productsInGroup = productsByGroup.get(groupId) || [];
      const groupName = groupId === 'sin-grupo' ? 'Sin Grupo' : (groupMap.get(groupId) || 'Grupo Desconocido');

      // Nombre de hoja válido para Excel (max 31 caracteres, sin caracteres especiales)
      const sheetName = makeUniqueSheetName(
        groupName.substring(0, 31).replace(/[\\/*?:\[\]]/g, '')
      );

      const data = productsInGroup
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((product) => {
          // Productos con variantes: una fila por variante
          if (product.variants && product.variants.length > 0) {
            return product.variants.map((variant) => ({
              Nombre: product.name,
              Medida: variant.size || '-',
              SKU: variant.sku || '-',
              Valor: Number(variant.price) || 0,
            }));
          }
          // Productos sin variantes: una fila con los datos del producto
          return [
            {
              Nombre: product.name,
              Medida: '-',
              SKU: product.sku || '-',
              Valor: Number(product.price) || 0,
            },
          ];
        });

      if (data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);

        // Anchos de columna: Nombre, Medida, SKU, Valor
        ws["!cols"] = [{ wch: 40 }, { wch: 18 }, { wch: 28 }, { wch: 12 }];

        // Formato numérico para la columna "Valor" (columna D, desde la fila 2)
        for (let row = 2; row <= data.length + 1; row++) {
          const cell = ws[`D${row}`];
          if (cell) cell.z = "#,##0";
        }

        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    });

    // Si no hay hojas creadas, crear una vacía
    if (wb.SheetNames.length === 0) {
      const ws = XLSX.utils.json_to_sheet([]);
      XLSX.utils.book_append_sheet(wb, ws, "Productos");
    }

    XLSX.writeFile(wb, "Lista de productos.xlsx");
  };

  // console.log(filteredProducts?.[44]);
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="text-slate-600 text-sm mt-1">
            Gestioná el catálogo, stock y precios
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={handleDownloadExcel}>
            <Download className="h-4 w-4 mr-2" />
            Descargar Excel
          </Button>
          <Link href="/publimar/banderas/productos/nuevo">
            <Button className="w-full bg-blue-900 hover:bg-blue-800 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Producto
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Total productos"
          value={stats.total}
          icon={Package}
          variant="blue"
        />
        <SummaryCard
          title="Stock bajo"
          value={stats.lowStock}
          subtitle="menos de 5"
          icon={AlertTriangle}
          variant="amber"
        />
        <SummaryCard
          title="Sin stock"
          value={stats.outOfStock}
          icon={PackageX}
          variant="red"
        />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label className="mb-2 block">Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar productos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Categoría</Label>
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger className="w-full md:w-[200px]">
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
            </div>
            <div>
              <Label className="mb-2 block">Grupo</Label>
              <Select
                value={selectedGroup}
                onValueChange={setSelectedGroup}
              >
                <SelectTrigger className="w-full md:w-[200px]">
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
            </div>
            <div className="md:ml-auto md:border-l md:pl-4 pt-4 border-t md:pt-0 md:border-t-0">
              <Label className="mb-2 block">
                Aumento{" "}
                {selectedProducts.length > 0 && (
                  <span className="text-slate-500 font-normal">
                    ({selectedProducts.length} seleccionados)
                  </span>
                )}
              </Label>
              <div className="flex items-end gap-2">
                <div className="relative w-28">
                  <Input
                    type="number"
                    placeholder="0"
                    value={increasePercentage}
                    onChange={(e) => setIncreasePercentage(e.target.value)}
                    className="pr-7"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                    %
                  </span>
                </div>
                <Button
                  onClick={handleApplyIncrease}
                  disabled={isApplyingIncrease || selectedProducts.length === 0}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isApplyingIncrease ? "Aplicando..." : "Aplicar Aumento"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={
                  !!filteredProducts &&
                  filteredProducts.length > 0 &&
                  selectedProducts.length === filteredProducts.length
                }
                onCheckedChange={handleSelectAll}
                title="Seleccionar todos"
                className="data-[state=checked]:bg-blue-900 data-[state=checked]:border-blue-900"
              />
              <CardTitle className="text-base font-semibold">Productos</CardTitle>
            </div>
            <span className="text-sm text-muted-foreground">
              {filteredProducts?.length || 0} resultados
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {currentItems && currentItems.length > 0 ? (
            <div className="space-y-1">
              {currentItems.map((product) => {
                const typedProduct = product as unknown as TProduct;
                const selectedVariant = getSelectedVariant(typedProduct);
                const isSelected = selectedProducts.includes(typedProduct.id);
                const thumb = typedProduct.imageUrls?.[0];
                const lowStock =
                  selectedVariant != null &&
                  Number.isFinite(Number(selectedVariant.stock)) &&
                  Number(selectedVariant.stock) < 5;
                return (
                  <div
                    key={typedProduct.id}
                    onClick={() => handleEditProduct(typedProduct.id)}
                    className={cn(
                      "flex items-center gap-4 p-3 rounded-lg transition-colors duration-150 group cursor-pointer",
                      isSelected ? "bg-blue-50/70" : "hover:bg-slate-50"
                    )}
                  >
                    {/* Selección */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() =>
                          handleProductSelection(typedProduct.id)
                        }
                        className="data-[state=checked]:bg-blue-900 data-[state=checked]:border-blue-900"
                      />
                    </div>

                    {/* Icono / miniatura */}
                    <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 overflow-hidden">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={typedProduct.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-4 w-4 text-blue-600" />
                      )}
                    </div>

                    {/* Nombre + categorías */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {typedProduct.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {getCategoryNames(typedProduct.categories)}
                      </p>
                    </div>

                    {/* Selector de medida */}
                    <div
                      className="hidden sm:block w-[150px] shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Medida" />
                          </SelectTrigger>
                          <SelectContent className="max-h-48 overflow-y-auto">
                            {typedProduct.variants.map((variant) => (
                              <SelectItem key={variant.id} value={variant.size}>
                                {variant.size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </div>

                    {/* Precio + stock */}
                    <div className="text-right shrink-0 w-24">
                      <p className="text-sm font-medium">
                        {selectedVariant
                          ? formatearPrecio(Number(selectedVariant.price))
                          : "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedVariant ? (
                          <span className={lowStock ? "text-red-500" : ""}>
                            Stock:{" "}
                            {selectedVariant.stock === Infinity
                              ? "∞"
                              : selectedVariant.stock}
                          </span>
                        ) : (
                          "sin variantes"
                        )}
                      </p>
                    </div>

                    {/* Acciones */}
                    <div
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            title="Acciones"
                            className="h-8 w-8 text-slate-500 hover:text-slate-900"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-40 p-1">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                            onClick={() => handleEditProduct(typedProduct.id)}
                          >
                            <Edit className="h-4 w-4" />
                            Editar
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-600 hover:bg-red-50"
                            onClick={() =>
                              handleDeleteProduct(
                                typedProduct.id,
                                typedProduct.name
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                            Eliminar
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No se encontraron productos
            </div>
          )}

          {filteredProducts && filteredProducts.length > 0 && (
            <div className="border-t">
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredProducts?.length ?? 0}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(n) => {
                  setItemsPerPage(n);
                  setCurrentPage(1);
                }}
                pageSizeOptions={[10, 15, 25]}
              />
            </div>
          )}
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
