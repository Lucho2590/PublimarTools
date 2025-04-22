"use client";

import { useState } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, where } from "firebase/firestore";
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
import collections from "~/lib/collections";
import { EProductCategory, EProductStatus, TProduct } from "~/types/product";

export default function ProductosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    EProductCategory | "all"
  >("all");
  const firestore = useFirestore();

  // Consulta a Firestore
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const productsQuery = query(productsCollection, orderBy("name"));

  const { status, data: products } = useFirestoreCollectionData(productsQuery, {
    idField: "id",
  });

  // Filtrar productos según la búsqueda y categoría
  const filteredProducts = products?.filter((product: TProduct) => {
    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Productos</h1>
        <Button asChild>
          <Link href="/dashboard/productos/nuevo">Nuevo producto</Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar productos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <select
                className="w-full p-2 border border-slate-300 rounded-md"
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as EProductCategory | "all")
                }
              >
                <option value="all">Todas las categorías</option>
                <option value={EProductCategory.NATIONAL_FLAG}>
                  Banderas Nacionales
                </option>
                <option value={EProductCategory.CUSTOM_FLAG}>
                  Banderas Personalizadas
                </option>
                <option value={EProductCategory.ACCESSORY}>Accesorios</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {status === "loading" ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts && filteredProducts.length > 0 ? (
                  filteredProducts.map((product: TProduct) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        {product.name}
                      </TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            product.status === EProductStatus.ACTIVE
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {product.status === EProductStatus.ACTIVE
                            ? "Activo"
                            : "Inactivo"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {product.hasVariants ? (
                          <span className="text-slate-500">Múltiples</span>
                        ) : (
                          <span
                            className={`${
                              product.stock && product.stock < 5
                                ? "text-red-500"
                                : ""
                            }`}
                          >
                            {product.stock}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.hasVariants ? (
                          <span className="text-slate-500">Múltiples</span>
                        ) : (
                          <span>${product.price?.toFixed(2)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/productos/${product.id}`}>
                              Ver
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              href={`/dashboard/productos/${product.id}/editar`}
                            >
                              Editar
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-slate-500"
                    >
                      {searchTerm || categoryFilter !== "all"
                        ? "No se encontraron productos con los filtros aplicados."
                        : "No hay productos disponibles. ¡Añade tu primer producto!"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
