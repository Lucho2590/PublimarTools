"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountSelect } from "@/components/admin/AccountSelect";
import {
  EPaymentMethod,
  PAYMENT_METHOD_ACCOUNT_TYPES,
  PAYMENT_METHOD_LABELS,
  TSaleFormaPago,
} from "@/types/sale";
import { formatearPrecio, redondearTotal } from "@/lib/utils";

type DiscountMode = "percent" | "amount";

interface PaymentStepProps {
  /** Suma de items (antes de descuento). */
  subtotal: number;
  /** Total con descuento aplicado (ya calculado en page). */
  total: number;
  discountMode: DiscountMode;
  discountValue: number;
  onDiscountModeChange: (mode: DiscountMode) => void;
  onDiscountValueChange: (value: number) => void;
  formasPago: TSaleFormaPago[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<TSaleFormaPago>) => void;
}

// Métodos ofrecidos en el POS (sin nota de crédito).
const POS_METHODS = [
  EPaymentMethod.CASH,
  EPaymentMethod.CREDIT_CARD,
  EPaymentMethod.DEBIT_CARD,
  EPaymentMethod.TRANSFER,
  EPaymentMethod.MERCADOPAGO,
  EPaymentMethod.CHECK,
];

export function PaymentStep({
  subtotal,
  total,
  discountMode,
  discountValue,
  onDiscountModeChange,
  onDiscountValueChange,
  formasPago,
  onAdd,
  onRemove,
  onUpdate,
}: PaymentStepProps) {
  const sumaFormas = formasPago.reduce((s, fp) => s + (fp.amount || 0), 0);
  const diferencia = redondearTotal(total - sumaFormas);
  const cuadra = Math.abs(diferencia) < 0.01;
  const descuento = redondearTotal(subtotal - total);

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Pago</h2>
      <p className="text-sm text-gray-500 mb-4">
        Aplicá un descuento si corresponde y elegí una o más formas de pago.
      </p>

      {/* Descuento + desglose */}
      <div className="rounded-lg border bg-white p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs">Descuento</Label>
            <div className="flex gap-2">
              <div className="flex rounded-md border bg-gray-50 p-0.5">
                <Button
                  type="button"
                  variant={discountMode === "percent" ? "default" : "ghost"}
                  size="sm"
                  className="px-3"
                  onClick={() => onDiscountModeChange("percent")}
                >
                  %
                </Button>
                <Button
                  type="button"
                  variant={discountMode === "amount" ? "default" : "ghost"}
                  size="sm"
                  className="px-3"
                  onClick={() => onDiscountModeChange("amount")}
                >
                  $
                </Button>
              </div>
              {discountMode === "percent" ? (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={discountValue || ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    onDiscountValueChange(
                      isNaN(v) ? 0 : Math.min(100, Math.max(0, v)),
                    );
                  }}
                  placeholder="0"
                  className="w-28"
                />
              ) : (
                <MoneyInput
                  value={discountValue || 0}
                  onValueChange={onDiscountValueChange}
                  placeholder="0"
                  className="w-40"
                />
              )}
            </div>
          </div>
          <div className="text-sm text-gray-600 space-y-0.5 sm:text-right">
            <div>Subtotal: {formatearPrecio(subtotal)}</div>
            <div>Descuento: −{formatearPrecio(descuento)}</div>
            <div className="text-base font-semibold text-gray-900">
              Total a cobrar: {formatearPrecio(total)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-2">
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Agregar forma de pago
        </Button>
      </div>

      <div className="space-y-2 overflow-y-auto flex-1 pr-1">
        {formasPago.map((fp, index) => (
          <div
            key={fp.id}
            className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border rounded-md p-3 bg-slate-50"
          >
            <div className="md:col-span-4 space-y-1">
              <Label className="text-xs">Método</Label>
              <Select
                value={fp.method}
                onValueChange={(value) =>
                  onUpdate(fp.id, { method: value as EPaymentMethod })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Método" />
                </SelectTrigger>
                <SelectContent>
                  {POS_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3 space-y-1">
              <Label className="text-xs">
                Monto
                {index === 0 && formasPago.length > 1 && (
                  <span className="text-gray-400 font-normal">
                    {" "}
                    (se completa solo)
                  </span>
                )}
              </Label>
              <MoneyInput
                value={fp.amount || 0}
                onValueChange={(amount) => onUpdate(fp.id, { amount })}
                placeholder="0"
              />
            </div>
            <div className="md:col-span-4 space-y-1">
              <Label className="text-xs">
                {fp.method === EPaymentMethod.CASH
                  ? "Caja / cuenta"
                  : "Cuenta destino"}{" "}
                (opcional)
              </Label>
              <AccountSelect
                value={fp.accountId || ""}
                onChange={(value) => onUpdate(fp.id, { accountId: value })}
                allowedTypes={
                  PAYMENT_METHOD_ACCOUNT_TYPES[fp.method]?.length
                    ? PAYMENT_METHOD_ACCOUNT_TYPES[fp.method]
                    : undefined
                }
                disabled={
                  fp.method === EPaymentMethod.CREDIT_CARD ||
                  fp.method === EPaymentMethod.DEBIT_CARD
                }
                placeholder={
                  fp.method === EPaymentMethod.CASH
                    ? "Ej: Efectivo Banderas"
                    : "Seleccionar cuenta"
                }
              />
            </div>
            <div className="md:col-span-1 flex justify-end">
              {formasPago.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(fp.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm px-1 mt-3 border-t pt-3">
        <span className="text-gray-600">
          Suma formas de pago: {formatearPrecio(sumaFormas)}
          <span className="mx-2 text-gray-400">|</span>
          Total: {formatearPrecio(total)}
        </span>
        <span
          className={
            cuadra ? "text-green-600 font-medium" : "text-red-600 font-medium"
          }
        >
          {cuadra ? "OK" : `Diferencia: ${formatearPrecio(diferencia)}`}
        </span>
      </div>
    </div>
  );
}
