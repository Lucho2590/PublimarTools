"use client";

import { useMemo } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, doc, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { toast } from "sonner";
import { Check, ExternalLink, PackageX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import collections from "@/lib/collections";
import { toDate } from "@/app/publimar/whatsapp/bot/components/shared";

type TStockAlert = {
  id: string;
  channel: string;
  phone?: string | null;
  customerName?: string | null;
  productName: string;
  size?: string | null;
  createdAt?: any;
};

/**
 * Clientes que pidieron algo sin stock y esperan el aviso. Cuando el producto
 * vuelve, el equipo le escribe y lo marca como avisado.
 */
export function StockAlertsCard() {
  const firestore = useFirestore();
  const { user } = useAuth();
  const alertsQuery = useMemo(
    () => query(collection(firestore, collections.BOT_STOCK_ALERTS), where("notified", "==", false)),
    [firestore]
  );
  const { data } = useFirestoreCollectionData(alertsQuery, { idField: "id" });
  const alerts = useMemo(
    () =>
      ((data as TStockAlert[] | undefined) || [])
        .slice()
        .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)),
    [data]
  );

  if (!alerts.length) return null;

  const markNotified = async (a: TStockAlert) => {
    await updateDoc(doc(firestore, collections.BOT_STOCK_ALERTS, a.id), {
      notified: true,
      notifiedAt: serverTimestamp(),
      notifiedBy: user?.email || user?.uid || null,
    });
    toast.success("Marcado como avisado");
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <PackageX className="h-4 w-4 text-amber-600" /> Esperando stock ({alerts.length})
        </CardTitle>
        <p className="text-sm text-slate-600">
          Clientes que pidieron algo que no había. Cuando vuelva a entrar, escribiles y marcalos como avisados.
        </p>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {alerts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
            <div className="min-w-0">
              <p className="font-medium text-sm">
                {a.productName}
                {a.size ? ` · ${a.size}` : ""}
              </p>
              <p className="text-xs text-slate-500">
                {a.customerName || (a.phone ? `+${a.phone}` : a.channel === "simulator" ? "Prueba del simulador" : "Cliente")}
                {toDate(a.createdAt) ? ` · ${toDate(a.createdAt)!.toLocaleDateString("es-AR")}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              {a.phone && a.channel === "whatsapp" && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://wa.me/${a.phone}`} target="_blank" rel="noreferrer">
                    WhatsApp <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
              <Button size="sm" onClick={() => markNotified(a)}>
                <Check className="h-4 w-4 mr-1" /> Ya le avisé
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
