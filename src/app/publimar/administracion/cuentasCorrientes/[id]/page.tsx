'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFirestore, useFirestoreDocData, useFirestoreCollectionData } from "reactfire";
import { collection, doc, query, where, orderBy, addDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { EProviderAccountStatus } from "@/types/providerAccount";
import { EPurchaseDepartment, EPurchasePaymentMethod } from "@/types/purchase";
import { useAuth } from "@/contexts/AuthContext";
import { formatearPrecio } from "@/lib/utils";
import { toast } from "sonner";
import { DollarSign, ArrowLeft, Plus, X } from "lucide-react";

const departmentLabels: Record<string, string> = {
  [EPurchaseDepartment.BANDERAS]: "Banderas",
  [EPurchaseDepartment.VIA_PUBLICA]: "Via Publica",
  [EPurchaseDepartment.ADMINISTRACION]: "Administracion",
};

const formatDate = (timestamp: any) => {
  if (!timestamp) return "-";
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toLocaleDateString("es-AR");
  }
  if (timestamp instanceof Date) {
    return timestamp.toLocaleDateString("es-AR");
  }
  if (typeof timestamp === 'string') {
    const [year, month, day] = timestamp.split('-');
    return `${day}/${month}/${year}`;
  }
  return new Date(timestamp).toLocaleDateString("es-AR");
};

export default function CuentaCorrienteDetailPage() {
  const params = useParams();
  const accountId = params.id as string;
  const firestore = useFirestore();
  const { userRole, userData } = useAuth();

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    date: new Date().toISOString().split("T")[0],
    method: '',
    notes: '',
  });

  // Obtener datos de la CC
  const accountRef = doc(firestore, "providerAccounts", accountId);
  const { status: accountStatus, data: account } = useFirestoreDocData(accountRef, { idField: "id" });

  // Obtener compras del proveedor con forma de pago CC
  const purchasesQuery = query(
    collection(firestore, "purchases"),
    where("providerId", "==", account?.providerId || "__none__"),
    where("paymentMethod", "==", EPurchasePaymentMethod.CUENTA_CORRIENTE),
    orderBy("date", "desc")
  );
  const { data: purchases } = useFirestoreCollectionData(purchasesQuery, { idField: "id" });

  // Filtrar compras que no estén eliminadas (soft delete)
  const activePurchases = useMemo(() => {
    return purchases?.filter((p: any) => !p.deletedAt) || [];
  }, [purchases]);

  // Obtener pagos de la CC
  const paymentsCollection = collection(firestore, "providerAccounts", accountId, "payments");
  const paymentsQuery = query(paymentsCollection, orderBy("date", "desc"));
  const { data: payments } = useFirestoreCollectionData(paymentsQuery, { idField: "id" });

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0) {
      toast.error("El monto debe ser mayor a 0");
      return;
    }
    if (!paymentForm.date) {
      toast.error("La fecha es requerida");
      return;
    }
    if (!paymentForm.method) {
      toast.error("El metodo de pago es requerido");
      return;
    }
    if (amount > (account?.balance || 0)) {
      toast.error("El monto no puede superar el saldo pendiente");
      return;
    }

    setPaymentLoading(true);
    try {
      // Agregar pago a subcollection
      await addDoc(paymentsCollection, {
        amount,
        date: paymentForm.date,
        method: paymentForm.method,
        notes: paymentForm.notes || "",
        registeredBy: userRole || "",
        registeredByName: userData?.displayName || "",
        createdAt: serverTimestamp(),
      });

      // Actualizar saldo de la CC
      await updateDoc(accountRef, {
        balance: increment(-amount),
        totalPayments: increment(amount),
        updatedAt: serverTimestamp(),
      });

      toast.success("Pago registrado correctamente");
      setPaymentForm({
        amount: '',
        date: new Date().toISOString().split("T")[0],
        method: '',
        notes: '',
      });
      setShowPaymentModal(false);
    } catch (error) {
      console.error("Error al registrar pago:", error);
      toast.error("Error al registrar el pago");
    } finally {
      setPaymentLoading(false);
    }
  };

  if (accountStatus === "loading") {
    return (
      <div className="flex justify-center my-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Cuenta corriente no encontrada.</p>
        <Button asChild className="mt-4">
          <Link href="/publimar/administracion/cuentasCorrientes">Volver</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="icon">
            <Link href="/publimar/administracion/cuentasCorrientes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{account.providerName}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                account.status === EProviderAccountStatus.ACTIVE
                  ? "bg-green-100 text-green-800"
                  : "bg-slate-100 text-slate-800"
              }`}>
                {account.status === EProviderAccountStatus.ACTIVE ? "Activa" : "Cerrada"}
              </span>
            </div>
          </div>
        </div>
        <Button
          onClick={() => setShowPaymentModal(true)}
          className="bg-green-600 hover:bg-green-700 text-white"
          disabled={account.status !== EProviderAccountStatus.ACTIVE || (account.balance || 0) <= 0}
        >
          <Plus className="h-4 w-4 mr-1" /> Registrar Pago
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-900 p-2 rounded-full">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600">Total Compras</p>
                <p className="text-xl font-bold text-blue-900">{formatearPrecio(Number(account.totalPurchases) || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-green-50 to-green-100 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-green-700 p-2 rounded-full">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600">Total Pagos</p>
                <p className="text-xl font-bold text-green-800">{formatearPrecio(Number(account.totalPayments) || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`bg-gradient-to-r ${Number(account.balance) > 0 ? 'from-red-50 to-red-100 border-red-200' : 'from-slate-50 to-slate-100 border-slate-200'}`}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`${Number(account.balance) > 0 ? 'bg-red-600' : 'bg-slate-600'} p-2 rounded-full`}>
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600">Saldo Pendiente</p>
                <p className={`text-xl font-bold ${Number(account.balance) > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {formatearPrecio(Number(account.balance) || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historial de Compras */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Historial de Compras (Cuenta Corriente)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Fecha</TableHead>
                  <TableHead className="text-left">Descripcion</TableHead>
                  <TableHead className="text-left">Departamento</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePurchases.length > 0 ? (
                  activePurchases.map((purchase: any) => (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-medium">{formatDate(purchase.date)}</TableCell>
                      <TableCell>{purchase.description || "-"}</TableCell>
                      <TableCell>{departmentLabels[purchase.department] || "-"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatearPrecio(Number(purchase.amount) || 0)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-slate-500">
                      No hay compras con Cuenta Corriente para este proveedor.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Historial de Pagos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Historial de Pagos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Fecha</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-left">Metodo</TableHead>
                  <TableHead className="text-left">Notas</TableHead>
                  <TableHead className="text-left">Registrado por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments && payments.length > 0 ? (
                  payments.map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{formatDate(payment.date)}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">{formatearPrecio(Number(payment.amount) || 0)}</TableCell>
                      <TableCell className="capitalize">{payment.method || "-"}</TableCell>
                      <TableCell>{payment.notes || "-"}</TableCell>
                      <TableCell>{payment.registeredByName || payment.registeredBy || "-"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-slate-500">
                      No hay pagos registrados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Pago */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Registrar Pago</span>
              <Button variant="ghost" size="icon" onClick={() => setShowPaymentModal(false)} className="h-6 w-6">
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-md border">
              <p className="text-sm text-slate-600">Saldo pendiente: <strong className="text-red-600">{formatearPrecio(Number(account.balance) || 0)}</strong></p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentAmount">Monto *</Label>
              <Input
                id="paymentAmount"
                type="number"
                min="0.01"
                step="0.01"
                max={account.balance || 0}
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                required
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentDate">Fecha *</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentForm.date}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Metodo de Pago *</Label>
              <Select
                value={paymentForm.method}
                onValueChange={(value) => setPaymentForm(prev => ({ ...prev, method: value }))}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar metodo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="echeq">E-Cheq</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentNotes">Notas</Label>
              <Textarea
                id="paymentNotes"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
                placeholder="Notas opcionales..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowPaymentModal(false)} disabled={paymentLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={paymentLoading} className="bg-green-600 hover:bg-green-700 text-white">
                {paymentLoading ? "Registrando..." : "Registrar Pago"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
