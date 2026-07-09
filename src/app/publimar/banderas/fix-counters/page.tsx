'use client';

import { useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, doc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import collections from "@/lib/collections";
import { isDeleted } from "@/lib/softDelete";
import { TProduct } from "@/types/product";
import { TSale, TSaleItem } from "@/types/sale";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

type ProductFix = {
  id: string;
  name: string;
  currentSalesCount: number;
  realSalesCount: number;
  needsFix: boolean;
};

export default function FixCountersPage() {
  const firestore = useFirestore();
  const [fixes, setFixes] = useState<ProductFix[]>([]);
  const [calculated, setCalculated] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [done, setDone] = useState(false);

  const { data: products, status: productsStatus } = useFirestoreCollectionData(
    collection(firestore, collections.PRODUCTS),
    { idField: "id" }
  );

  const { data: sales, status: salesStatus } = useFirestoreCollectionData(
    collection(firestore, collections.SALES),
    { idField: "id" }
  );

  const loading = productsStatus === "loading" || salesStatus === "loading";

  const calculate = () => {
    if (!products || !sales) return;

    // Contar ventas reales por producto desde la coleccion de sales
    const salesByProduct = new Map<string, number>();

    (sales as unknown as TSale[]).forEach((sale) => {
      // Ignorar ventas soft-deleted
      if ((sale as any).deleted) return;

      const seenProducts = new Set<string>();

      sale.items?.forEach((item: TSaleItem) => {
        if (!item.productId || item.isManual) return;

        // salesCount = cantidad de ventas distintas que incluyen este producto
        if (!seenProducts.has(item.productId)) {
          const current = salesByProduct.get(item.productId) || 0;
          salesByProduct.set(item.productId, current + 1);
          seenProducts.add(item.productId);
        }
      });
    });

    // Comparar con los contadores actuales de cada producto (ignorar eliminados)
    const result: ProductFix[] = (products as unknown as TProduct[])
      .filter((product) => !isDeleted(product))
      .map((product) => {
      const realCount = salesByProduct.get(product.id) || 0;
      const currentCount = product.salesCount || 0;

      return {
        id: product.id,
        name: product.name,
        currentSalesCount: currentCount,
        realSalesCount: realCount,
        needsFix: currentCount !== realCount,
      };
    });

    // Mostrar primero los que necesitan fix
    result.sort((a, b) => (a.needsFix === b.needsFix ? 0 : a.needsFix ? -1 : 1));
    setFixes(result);
    setCalculated(true);
  };

  const applyFixes = async () => {
    setFixing(true);
    try {
      const toFix = fixes.filter((f) => f.needsFix);
      for (const fix of toFix) {
        const productRef = doc(firestore, collections.PRODUCTS, fix.id);
        await updateDoc(productRef, {
          salesCount: fix.realSalesCount,
        });
      }
      setDone(true);
    } catch (error) {
      console.error("Error aplicando fixes:", error);
    } finally {
      setFixing(false);
    }
  };

  const needsFixCount = fixes.filter((f) => f.needsFix).length;

  if (loading) {
    return (
      <div className="container mx-auto py-6 flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recalcular contadores de ventas</h1>
        <p className="text-gray-500 mt-1">
          Compara el contador de ventas de cada producto con las ventas reales registradas.
        </p>
      </div>

      {!calculated && (
        <Button onClick={calculate} size="lg">
          Calcular diferencias
        </Button>
      )}

      {calculated && (
        <>
          <div className="flex items-center gap-4">
            {needsFixCount > 0 ? (
              <>
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-semibold">{needsFixCount} productos con contadores incorrectos</span>
                </div>
                {!done && (
                  <Button onClick={applyFixes} disabled={fixing} variant="destructive">
                    {fixing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Corregir todos
                  </Button>
                )}
                {done && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-semibold">Corregidos!</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">Todos los contadores estan correctos</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {fixes.map((fix) => (
              <Card
                key={fix.id}
                className={`p-4 ${fix.needsFix ? "border-amber-400 bg-amber-50" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{fix.name}</span>
                  <div className="text-sm text-right">
                    <div className="text-gray-500">Vendidos</div>
                    <div>
                      {fix.needsFix ? (
                        <span>
                          <span className="text-red-500 line-through">{fix.currentSalesCount}</span>
                          {" → "}
                          <span className="text-green-600 font-semibold">{fix.realSalesCount}</span>
                        </span>
                      ) : (
                        <span className="text-green-600">{fix.currentSalesCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
