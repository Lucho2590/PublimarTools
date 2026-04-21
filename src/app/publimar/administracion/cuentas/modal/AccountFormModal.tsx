"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/contexts/AuthContext";
import {
  TAccount,
  EAccountType,
  EAccountStatus,
  EAccountDepartment,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_DEPARTMENT_LABELS,
} from "@/types/account";

interface AccountFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: TAccount | null;
  onSuccess?: () => void;
}

const EMPTY_FORM: Omit<TAccount, "id" | "createdAt" | "updatedAt" | "createdBy"> = {
  name: "",
  type: EAccountType.BANK,
  bankName: "",
  accountNumber: "",
  alias: "",
  holder: "",
  department: undefined,
  initialBalance: 0,
  currentBalance: 0,
  currency: "ARS",
  status: EAccountStatus.ACTIVE,
  notes: "",
};

export function AccountFormModal({
  open,
  onOpenChange,
  account,
  onSuccess,
}: AccountFormModalProps) {
  const { user, userData } = useAuth();
  const { createAccount, updateAccount } = useAccounts({ includeArchived: true });
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isEditing = !!account?.id;

  useEffect(() => {
    if (account) {
      setForm({
        name: account.name ?? "",
        type: account.type ?? EAccountType.BANK,
        bankName: account.bankName ?? "",
        accountNumber: account.accountNumber ?? "",
        alias: account.alias ?? "",
        holder: account.holder ?? "",
        department: account.department,
        initialBalance: Number(account.initialBalance) || 0,
        currentBalance: Number(account.currentBalance) || 0,
        currency: account.currency ?? "ARS",
        status: account.status ?? EAccountStatus.ACTIVE,
        notes: account.notes ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [account, open]);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    if (!user) {
      toast.error("No hay usuario autenticado");
      return;
    }
    setSaving(true);
    try {
      if (isEditing && account?.id) {
        // No permitimos editar currentBalance directo desde acá; eso va por movimiento de ajuste.
        const { currentBalance: _omit, ...patch } = form;
        await updateAccount(account.id, patch);
        toast.success("Cuenta actualizada");
      } else {
        await createAccount({
          ...form,
          createdBy: userData?.id || user.uid,
          currentBalance: Number(form.initialBalance) || 0,
        });
        toast.success("Cuenta creada");
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error ? e.message : "Error al guardar la cuenta",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar cuenta" : "Nueva cuenta"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos de la cuenta. El saldo actual se ajusta sólo por movimientos."
              : "Cargá los datos de la cuenta. El saldo inicial será el saldo actual."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Nombre *</Label>
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Ej: Galicia CC Empresa"
              />
            </div>
            <div>
              <Label className="mb-1 block">Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => update("type", v as EAccountType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(EAccountType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Banco / Proveedor</Label>
              <Input
                value={form.bankName ?? ""}
                onChange={(e) => update("bankName", e.target.value)}
                placeholder="Galicia, MercadoPago, etc."
              />
            </div>
            <div>
              <Label className="mb-1 block">Departamento</Label>
              <Select
                value={form.department ?? "__none__"}
                onValueChange={(v) =>
                  update(
                    "department",
                    v === "__none__" ? undefined : (v as EAccountDepartment),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {Object.values(EAccountDepartment).map((d) => (
                    <SelectItem key={d} value={d}>
                      {ACCOUNT_DEPARTMENT_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-1 block">N° Cuenta / CBU</Label>
              <Input
                value={form.accountNumber ?? ""}
                onChange={(e) => update("accountNumber", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block">Alias / CVU</Label>
              <Input
                value={form.alias ?? ""}
                onChange={(e) => update("alias", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block">Titular</Label>
              <Input
                value={form.holder ?? ""}
                onChange={(e) => update("holder", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-1 block">
                {isEditing ? "Saldo inicial" : "Saldo inicial"}
              </Label>
              <Input
                type="number"
                step="0.01"
                value={form.initialBalance}
                onChange={(e) =>
                  update("initialBalance", Number(e.target.value) || 0)
                }
                disabled={isEditing}
              />
            </div>
            <div>
              <Label className="mb-1 block">Moneda</Label>
              <Select
                value={form.currency}
                onValueChange={(v) =>
                  update("currency", v as TAccount["currency"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Estado</Label>
              <Select
                value={form.status}
                onValueChange={(v) => update("status", v as EAccountStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EAccountStatus.ACTIVE}>Activa</SelectItem>
                  <SelectItem value={EAccountStatus.ARCHIVED}>
                    Archivada
                  </SelectItem>
                </SelectContent>
              </Select>
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
            {saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear cuenta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
