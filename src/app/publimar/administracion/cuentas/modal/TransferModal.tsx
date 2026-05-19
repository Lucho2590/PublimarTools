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
import { ArrowRight } from "lucide-react";
import { MoneyInput } from "@/components/ui/money-input";
import { AccountSelect } from "@/components/admin/AccountSelect";
import { useAuth } from "@/contexts/AuthContext";
import { useAccounts } from "@/hooks/useAccounts";
import { transferBetweenAccounts } from "@/lib/accountMovements";
import { formatearPrecio } from "@/lib/utils";

interface TransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// Fecha/hora local en formato compatible con <input type="datetime-local">.
const nowLocal = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

export function TransferModal({
  open,
  onOpenChange,
  onSuccess,
}: TransferModalProps) {
  const firestore = useFirestore();
  const { user, userData } = useAuth();
  const { accounts } = useAccounts({ includeArchived: true });

  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState(0);
  const [dateTime, setDateTime] = useState(nowLocal());
  const [concepto, setConcepto] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFromAccountId("");
      setToAccountId("");
      setAmount(0);
      setDateTime(nowLocal());
      setConcepto("");
    }
  }, [open]);

  const fromAccount = accounts.find((a) => a.id === fromAccountId);

  const handleSubmit = async () => {
    const monto = Number(amount);
    if (!fromAccountId || !toAccountId) {
      toast.error("Elegí la cuenta de origen y destino");
      return;
    }
    if (fromAccountId === toAccountId) {
      toast.error("La cuenta de origen y destino deben ser distintas");
      return;
    }
    if (!monto || isNaN(monto) || monto <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    if (!concepto.trim()) {
      toast.error("Ingresá un concepto");
      return;
    }
    setSaving(true);
    try {
      await transferBetweenAccounts(firestore, {
        fromAccountId,
        toAccountId,
        amount: monto,
        description: concepto.trim(),
        date: dateTime ? new Date(dateTime) : new Date(),
        createdBy: userData?.id || user?.uid || "",
      });
      toast.success("Transferencia realizada");
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      console.error("Error en transferencia entre cuentas", e);
      toast.error(
        e instanceof Error ? e.message : "Error al realizar la transferencia",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Transferencia entre cuentas</DialogTitle>
          <DialogDescription>
            Mueve dinero de una cuenta a otra. Se registra un egreso en la
            cuenta de origen y un ingreso en la de destino.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3">
            <div>
              <Label className="mb-1 block">Cuenta de origen</Label>
              <AccountSelect
                value={fromAccountId}
                onChange={setFromAccountId}
                placeholder="Buscar por nombre o N°"
              />
              {fromAccount && (
                <p className="text-xs text-slate-500 mt-1">
                  Saldo actual:{" "}
                  <span className="font-medium">
                    {formatearPrecio(Number(fromAccount.currentBalance) || 0)}{" "}
                    {fromAccount.currency}
                  </span>
                </p>
              )}
            </div>
            <div className="flex items-center justify-center sm:mt-6">
              <div className="rounded-full bg-slate-100 p-2 text-slate-500">
                <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
              </div>
            </div>
            <div>
              <Label className="mb-1 block">Cuenta de destino</Label>
              <AccountSelect
                value={toAccountId}
                onChange={setToAccountId}
                placeholder="Buscar por nombre o N°"
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Monto</Label>
            <MoneyInput
              value={amount}
              onValueChange={setAmount}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="mb-1 block">Fecha y hora</Label>
            <Input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block">Concepto</Label>
            <Textarea
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              rows={2}
              placeholder="Motivo de la transferencia"
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
            {saving ? "Transfiriendo…" : "Transferir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
