"use client";

import { useMemo, useState } from "react";
import { Search, LayoutGrid, List, Plus, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TProduct, TProductCategory, TProductVariant } from "@/types/product";
import { formatearPrecio } from "@/lib/utils";

type ViewMode = "grid" | "list";

interface ManualItemInput {
  name: string;
  variantName: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface ProductCatalogProps {
  products: TProduct[];
  categories: TProductCategory[];
  onAdd: (product: TProduct, variant: TProductVariant) => void;
  onAddManual: (item: ManualItemInput) => void;
  cartQty: (productId: string, variantId: string) => number;
}

const emptyManualItem: ManualItemInput = {
  name: "",
  variantName: "",
  description: "",
  quantity: 1,
  unitPrice: 0,
};

export function ProductCatalog({
  products,
  categories,
  onAdd,
  onAddManual,
  cartQty,
}: ProductCatalogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualItem, setManualItem] = useState<ManualItemInput>(emptyManualItem);

  const handleAddManual = () => {
    if (!manualItem.name.trim() || Number(manualItem.unitPrice) <= 0) {
      toast.error("Nombre y precio son requeridos");
      return;
    }
    onAddManual({
      ...manualItem,
      name: manualItem.name.trim(),
      variantName: manualItem.variantName.trim(),
      description: manualItem.description.trim(),
    });
    setManualItem(emptyManualItem);
    setShowManualDialog(false);
    toast.success("Item manual agregado");
  };
  // Variante elegida por producto (default: primera)
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});

  const categoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? "";

  const filtered = useMemo(() => {
    const seen = new Set<string>();
    return products
      .filter((p) => {
        // Evitar duplicados por nombre (mismo criterio que "nueva venta")
        if (seen.has(p.name)) return false;

        const matchesCategory =
          selectedCategory === "all" ||
          (p.categories && p.categories.includes(selectedCategory));
        if (!matchesCategory) return false;

        const terms = searchTerm
          .toLowerCase()
          .split(/[,\s]+/)
          .filter((t) => t.trim().length > 0);
        if (terms.length) {
          const haystack = [
            p.name,
            p.sku,
            ...(p.variants?.flatMap((v) => [
              v.size,
              v.sku,
              v.price?.toString(),
            ]) ?? []),
            p.categories?.map(categoryName).filter(Boolean).join(" "),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!terms.every((t) => haystack.includes(t))) return false;
        }

        seen.add(p.name);
        return true;
      })
      .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, categories, searchTerm, selectedCategory]);

  const getVariant = (product: TProduct): TProductVariant | undefined => {
    if (!product.variants?.length) return undefined;
    const chosen = product.variants.find(
      (v) => v.id === selectedVariants[product.id],
    );
    return chosen ?? product.variants[0];
  };

  const handleAdd = (product: TProduct) => {
    const variant = getVariant(product);
    if (variant) onAdd(product, variant);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center mb-4">
        {/* Renglón 1 en mobile: búsqueda a todo el ancho */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar producto, SKU, talle…"
            className="pl-9"
          />
        </div>
        {/* Renglón 2 en mobile: controles compactos */}
        <div className="flex items-center gap-2">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="flex-1 sm:w-52 sm:flex-none">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(searchTerm || selectedCategory !== "all") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 px-2 text-gray-500"
              onClick={() => {
                setSearchTerm("");
                setSelectedCategory("all");
              }}
            >
              <X className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Limpiar</span>
            </Button>
          )}
          <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" className="shrink-0">
                <FileText className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Item Manual</span>
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Agregar item manual</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="manual-name">Nombre *</Label>
                <Input
                  id="manual-name"
                  value={manualItem.name}
                  onChange={(e) =>
                    setManualItem((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Ej: Bandera personalizada"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-variant">Variante / Medida</Label>
                <Input
                  id="manual-variant"
                  value={manualItem.variantName}
                  onChange={(e) =>
                    setManualItem((prev) => ({
                      ...prev,
                      variantName: e.target.value,
                    }))
                  }
                  placeholder='Ej: 2x1m, "Talle L" (opcional)'
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-description">Descripción</Label>
                <Textarea
                  id="manual-description"
                  value={manualItem.description}
                  onChange={(e) =>
                    setManualItem((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Detalle adicional (opcional)"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="manual-quantity">Cantidad *</Label>
                  <Input
                    id="manual-quantity"
                    type="number"
                    min={1}
                    value={manualItem.quantity}
                    onChange={(e) =>
                      setManualItem((prev) => ({
                        ...prev,
                        quantity: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="manual-price">Precio unitario *</Label>
                  <MoneyInput
                    id="manual-price"
                    value={manualItem.unitPrice || 0}
                    onValueChange={(n) =>
                      setManualItem((prev) => ({
                        ...prev,
                        unitPrice: n,
                      }))
                    }
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-semibold text-gray-900">
                  {formatearPrecio(
                    Math.max(0, Number(manualItem.unitPrice) || 0) *
                      Math.max(1, Number(manualItem.quantity) || 1),
                  )}
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowManualDialog(false)}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={handleAddManual}>
                <Plus className="w-4 h-4 mr-1" />
                Agregar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          <div className="flex shrink-0 gap-0.5 rounded-md border bg-white p-0.5">
            <Button
              type="button"
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-1.5"
              onClick={() => setViewMode("grid")}
              aria-label="Vista en tarjetas"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-1.5"
              onClick={() => setViewMode("list")}
              aria-label="Vista en lista"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Resultados */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            No se encontraron productos
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((product) => {
              const variant = getVariant(product);
              const stock = Number(variant?.stock ?? 0);
              const inCart = variant ? cartQty(product.id, variant.id) : 0;
              const disabled = !variant || stock - inCart <= 0;
              return (
                <div
                  key={product.id}
                  className="flex flex-col rounded-lg border bg-white p-3 hover:shadow-sm transition-shadow"
                >
                  <div className="font-medium text-sm text-gray-900 line-clamp-2 min-h-[2.5rem]">
                    {product.name}
                  </div>
                  {product.variants?.length > 1 ? (
                    <Select
                      value={variant?.id}
                      onValueChange={(v) =>
                        setSelectedVariants((prev) => ({
                          ...prev,
                          [product.id]: v,
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs mt-2">
                        <SelectValue placeholder="Variante" />
                      </SelectTrigger>
                      <SelectContent>
                        {product.variants.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.size} · {formatearPrecio(Number(v.price))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    variant && (
                      <div className="text-xs text-gray-500 mt-2">
                        {variant.size}
                      </div>
                    )
                  )}
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="font-semibold text-gray-900">
                      {variant ? formatearPrecio(Number(variant.price)) : "—"}
                    </span>
                    <span
                      className={`text-xs ${
                        stock - inCart <= 0 ? "text-red-500" : "text-gray-400"
                      }`}
                    >
                      Stock: {stock - inCart}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2 w-full"
                    disabled={disabled}
                    onClick={() => handleAdd(product)}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Agregar
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="divide-y rounded-lg border bg-white">
            {filtered.map((product) => {
              const variant = getVariant(product);
              const stock = Number(variant?.stock ?? 0);
              const inCart = variant ? cartQty(product.id, variant.id) : 0;
              const disabled = !variant || stock - inCart <= 0;
              return (
                <div
                  key={product.id}
                  className="flex items-center gap-3 p-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">
                      {product.name}
                    </div>
                    <div className="text-xs text-gray-400">
                      Stock: {stock - inCart}
                    </div>
                  </div>
                  {product.variants?.length > 1 && (
                    <Select
                      value={variant?.id}
                      onValueChange={(v) =>
                        setSelectedVariants((prev) => ({
                          ...prev,
                          [product.id]: v,
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue placeholder="Variante" />
                      </SelectTrigger>
                      <SelectContent>
                        {product.variants.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <span className="font-semibold text-sm text-gray-900 w-24 text-right">
                    {variant ? formatearPrecio(Number(variant.price)) : "—"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={disabled}
                    onClick={() => handleAdd(product)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
