"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useFirestore } from "reactfire";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AccountSelect } from "@/components/admin/AccountSelect";
import { useAuth } from "@/contexts/AuthContext";
import collections from "@/lib/collections";
import {
  PAYMENT_ACCOUNT_DEFAULTS_DOC_ID,
  TPaymentAccountDefaults,
} from "@/types/paymentAccountDefaults";
import { usePaymentAccountDefaults } from "@/hooks/usePaymentAccountDefaults";
import { EPaymentMethod, PAYMENT_METHOD_LABELS } from "@/types/sale";
import {
  EPurchasePaymentMethod,
  PURCHASE_PAYMENT_METHOD_LABELS,
} from "@/types/purchase";

interface PaymentDefaultsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Métodos que no impactan en una cuenta (no se configuran).
const EXCLUDED_SALES: EPaymentMethod[] = [EPaymentMethod.CREDIT_NOTE];
const EXCLUDED_PURCHASES: EPurchasePaymentMethod[] = [
  EPurchasePaymentMethod.CUENTA_CORRIENTE,
];

const SALES_METHODS = Object.values(EPaymentMethod).filter(
  (m) => !EXCLUDED_SALES.includes(m),
);
const PURCHASE_METHODS = Object.values(EPurchasePaymentMethod).filter(
  (m) => !EXCLUDED_PURCHASES.includes(m),
);

export function PaymentDefaultsModal({
  open,
  onOpenChange,
}: PaymentDefaultsModalProps) {
  const firestore = useFirestore();
  const { user, userData } = useAuth();
  const { defaults } = usePaymentAccountDefaults();

  const [sales, setSales] = useState<Record<string, string>>({});
  const [purchases, setPurchases] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Sincronizar el form con la config guardada cada vez que se abre.
  useEffect(() => {
    if (open) {
      setSales({ ...(defaults.sales as Record<string, string>) });
      setPurchases({ ...(defaults.purchases as Record<string, string>) });
    }
  }, [open, defaults]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        sales: sales as TPaymentAccountDefaults["sales"],
        purchases: purchases as TPaymentAccountDefaults["purchases"],
        updatedBy: userData?.id || user?.uid || "",
        updatedAt: serverTimestamp(),
      };
      await setDoc(
        doc(
          firestore,
          collections.PAYMENT_ACCOUNT_DEFAULTS,
          PAYMENT_ACCOUNT_DEFAULTS_DOC_ID,
        ),
        payload,
        { merge: true },
      );
      toast.success("Configuración guardada");
      onOpenChange(false);
    } catch (e) {
      console.error("Error al guardar configuración", e);
      toast.error(
        e instanceof Error ? e.message : "Error al guardar la configuración",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cuentas por forma de pago</DialogTitle>
          <DialogDescription>
            Cuenta donde impacta cada forma de pago por defecto. Es solo una
            sugerencia: al registrar el cobro/pago se puede elegir otra cuenta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <h4 className="font-medium mb-2">Ventas y Órdenes</h4>
            <div className="space-y-3">
              {SALES_METHODS.map((m) => (
                <div key={`sale-${m}`}>
                  <Label className="mb-1 block text-sm">
                    {PAYMENT_METHOD_LABELS[m]}
                  </Label>
                  <AccountSelect
                    value={sales[m] || ""}
                    onChange={(value) =>
                      setSales((prev) => ({ ...prev, [m]: value }))
                    }
                    placeholder="Sin cuenta por defecto"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Compras y Gastos operativos</h4>
            <div className="space-y-3">
              {PURCHASE_METHODS.map((m) => (
                <div key={`purchase-${m}`}>
                  <Label className="mb-1 block text-sm">
                    {PURCHASE_PAYMENT_METHOD_LABELS[m]}
                  </Label>
                  <AccountSelect
                    value={purchases[m] || ""}
                    onChange={(value) =>
                      setPurchases((prev) => ({ ...prev, [m]: value }))
                    }
                    placeholder="Sin cuenta por defecto"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
