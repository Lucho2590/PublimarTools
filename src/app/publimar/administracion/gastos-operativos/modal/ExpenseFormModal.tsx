"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountSelect } from "@/components/admin/AccountSelect";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalExpenses } from "@/hooks/useOperationalExpenses";
import { registerAccountMovement } from "@/lib/accountMovements";
import {
  TOperationalExpense,
  EExpenseCategory,
  EXPENSE_CATEGORY_LABELS,
} from "@/types/operationalExpense";
import { EPurchaseDepartment, EPurchasePaymentMethod } from "@/types/purchase";
import { EMovementType } from "@/types/accountMovement";

interface ExpenseFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: TOperationalExpense | null;
  onSuccess?: () => void;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const EMPTY: Omit<
  TOperationalExpense,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "createdByName"
> = {
  date: todayStr(),
  category: EExpenseCategory.OTRO,
  description: "",
  amount: 0,
  department: EPurchaseDepartment.ADMINISTRACION,
  accountId: undefined,
  paymentMethod: EPurchasePaymentMethod.TRANSFERENCIA,
  notes: "",
};

const DEPARTMENT_LABELS: Record<EPurchaseDepartment, string> = {
  [EPurchaseDepartment.BANDERAS]: "Banderas",
  [EPurchaseDepartment.VIA_PUBLICA]: "Vía Pública",
  [EPurchaseDepartment.ADMINISTRACION]: "Administración",
};

const PAYMENT_METHOD_LABELS: Record<EPurchasePaymentMethod, string> = {
  [EPurchasePaymentMethod.EFECTIVO]: "Efectivo",
  [EPurchasePaymentMethod.TARJETA]: "Tarjeta",
  [EPurchasePaymentMethod.TRANSFERENCIA]: "Transferencia",
  [EPurchasePaymentMethod.CUENTA_CORRIENTE]: "Cuenta corriente",
  [EPurchasePaymentMethod.CHEQUE]: "Cheque",
  [EPurchasePaymentMethod.ECHEQ]: "E-Cheq",
};

export function ExpenseFormModal({
  open,
  onOpenChange,
  expense,
  onSuccess,
}: ExpenseFormModalProps) {
  const firestore = useFirestore();
  const { user, userData } = useAuth();
  const { createExpense, updateExpense } = useOperationalExpenses();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const isEditing = !!expense?.id;

  useEffect(() => {
    if (expense) {
      setForm({
        date: expense.date ?? todayStr(),
        category: expense.category ?? EExpenseCategory.OTRO,
        description: expense.description ?? "",
        amount: Number(expense.amount) || 0,
        department: expense.department ?? EPurchaseDepartment.ADMINISTRACION,
        accountId: expense.accountId,
        paymentMethod:
          expense.paymentMethod ?? EPurchasePaymentMethod.TRANSFERENCIA,
        notes: expense.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [expense, open]);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.description.trim()) {
      toast.error("La descripción es requerida");
      return;
    }
    if (!form.amount || form.amount <= 0) {
      toast.error("El monto debe ser mayor a 0");
      return;
    }
    if (!user) {
      toast.error("No hay usuario autenticado");
      return;
    }

    setSaving(true);
    try {
      if (isEditing && expense?.id) {
        await updateExpense(expense.id, {
          ...form,
        });
        toast.success("Gasto actualizado");
        // Nota: en edición no creamos movimiento adicional para no duplicar.
      } else {
        const id = await createExpense({
          ...form,
          createdBy: userData?.id || user.uid,
          createdByName: userData?.displayName || user.email || "",
        });

        // Si tiene accountId, registramos movimiento de egreso.
        if (form.accountId) {
          try {
            await registerAccountMovement(firestore, {
              accountId: form.accountId,
              type: EMovementType.EXPENSE,
              amount: Number(form.amount) || 0,
              description: `Gasto operativo: ${form.description}`,
              date: new Date(`${form.date}T12:00:00`),
              sourceType: "operationalExpense",
              sourceId: id,
              createdBy: userData?.id || user.uid,
            });
          } catch (e) {
            console.error("Error al registrar movimiento", e);
            toast.error(
              "Gasto guardado pero falló el registro del movimiento en la cuenta",
            );
          }
        }

        toast.success("Gasto registrado");
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar gasto operativo" : "Nuevo gasto operativo"}
          </DialogTitle>
          <DialogDescription>
            Sueldos, alquileres, servicios, impuestos y otros gastos no
            asociados a una compra de proveedor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Fecha *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block">Categoría *</Label>
              <Select
                value={form.category}
                onValueChange={(v) => update("category", v as EExpenseCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(EExpenseCategory).map((c) => (
                    <SelectItem key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-1 block">Descripción *</Label>
            <Input
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Ej: Sueldo Marzo - Juan Pérez"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Monto *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) =>
                  update("amount", Number(e.target.value) || 0)
                }
              />
            </div>
            <div>
              <Label className="mb-1 block">Departamento *</Label>
              <Select
                value={form.department}
                onValueChange={(v) =>
                  update("department", v as EPurchaseDepartment)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(EPurchaseDepartment).map((d) => (
                    <SelectItem key={d} value={d}>
                      {DEPARTMENT_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Forma de pago *</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v) =>
                  update("paymentMethod", v as EPurchasePaymentMethod)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(EPurchasePaymentMethod).map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Cuenta de origen</Label>
              <AccountSelect
                value={form.accountId}
                onChange={(id) => update("accountId", id)}
                placeholder="Seleccionar cuenta"
              />
              {!isEditing && !form.accountId && (
                <p className="text-xs text-slate-500 mt-1">
                  Sin cuenta no se descuenta del saldo.
                </p>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-1 block">Notas</Label>
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) => update("notes", e.target.value)}
              rows={2}
            />
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
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Guardando…" : isEditing ? "Guardar" : "Registrar gasto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
