"use client";

import { useMemo, useState } from "react";
import { Search, LayoutGrid, List, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TProduct, TProductCategory, TProductVariant } from "@/types/product";
import { formatearPrecio } from "@/lib/utils";

type ViewMode = "grid" | "list";

interface ProductCatalogProps {
  products: TProduct[];
  categories: TProductCategory[];
  onAdd: (product: TProduct, variant: TProductVariant) => void;
  cartQty: (productId: string, variantId: string) => number;
}

export function ProductCatalog({
  products,
  categories,
  onAdd,
  cartQty,
}: ProductCatalogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
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
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar producto, SKU, talle…"
            className="pl-9"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full sm:w-52">
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
        <div className="flex gap-1 rounded-md border bg-white p-0.5">
          <Button
            type="button"
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="sm"
            className="px-2"
            onClick={() => setViewMode("grid")}
            aria-label="Vista en tarjetas"
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            className="px-2"
            onClick={() => setViewMode("list")}
            aria-label="Vista en lista"
          >
            <List className="w-4 h-4" />
          </Button>
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
