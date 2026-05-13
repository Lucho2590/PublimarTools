'use client';

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useFirestore, useFirestoreDocData } from "reactfire";
import { doc, updateDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCuit } from "@/lib/cuit";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import collections from "@/lib/collections";
import { EBillingStatus, TBilling, TBillingPaymentMethod, TPaymentRecord } from "@/types/billing";
import { EPaymentMethod } from "@/types/sale";
import { ArrowLeft, Plus, Edit2, Trash2, User, FileText, CreditCard, DollarSign, Calendar, Check, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "reactfire";
import { Badge } from "@/components/ui/badge";
import { useClientAvailableCredit } from "@/hooks/useCreditNotes";
import { applyCreditNoteToDocument } from "@/lib/creditNotes";
import { formatearPrecio } from "@/lib/utils";

export default function FacturacionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const billingId = params.id as string;
  const firestore = useFirestore();
  const { data: user } = useUser();

  // Estado para modales
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditFormasPagoModal, setShowEditFormasPagoModal] = useState(false);
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);

  // Estado para nuevo pago
  const [newPayment, setNewPayment] = useState({
    amount: '',
    method: EPaymentMethod.CASH,
    banco: '',
    notes: '',
  });

  // Estado para editar formas de pago
  const [editingFormasPago, setEditingFormasPago] = useState<TBillingPaymentMethod[]>([]);

  // Cargar datos del billing
  const billingRef = doc(firestore, collections.BILLINGS, billingId);
  const { status, data: billing } = useFirestoreDocData(billingRef, {
    idField: "id",
  }) as { status: string; data: TBilling };

  // Notas de crédito disponibles del cliente
  const clientId = billing?.client?.id;
  const { notes: availableNotes, total: availableCredit } =
    useClientAvailableCredit(clientId);
  const [applyingNoteId, setApplyingNoteId] = useState<string | null>(null);

  const handleApplyCreditNote = async (noteId: string) => {
    if (!billing || !user?.uid) return;
    if (billing.status === EBillingStatus.PAID) {
      toast.error("La facturación ya está totalmente pagada");
      return;
    }
    setApplyingNoteId(noteId);
    try {
      const result = await applyCreditNoteToDocument(firestore, {
        noteId,
        documentId: billingId,
        documentType: "billing",
        documentNumber: billing.number,
        documentTotal: billing.totalAmount,
        appliedBy: user.uid,
      });
      toast.success(
        `Nota aplicada: ${formatearPrecio(result.appliedAmount)}` +
          (result.forfeitedAmount > 0
            ? ` (sobrante perdido: ${formatearPrecio(result.forfeitedAmount)})`
            : ""),
      );
    } catch (err) {
      console.error("Error al aplicar nota de crédito:", err);
      toast.error(
        err instanceof Error ? err.message : "Error al aplicar la nota de crédito",
      );
    } finally {
      setApplyingNoteId(null);
    }
  };

  // Calcular porcentaje de progreso
  const progressPercent = useMemo(() => {
    if (!billing || !billing.totalAmount) return 0;
    return Math.min((billing.totalPaid / billing.totalAmount) * 100, 100);
  }, [billing]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  const formatDate = (date: any) => {
    if (!date) return "-";
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('es-AR');
  };

  const getStatusLabel = (status: EBillingStatus) => {
    const labels = {
      [EBillingStatus.PENDING]: "Pendiente",
      [EBillingStatus.PARTIAL]: "Parcial",
      [EBillingStatus.PAID]: "Pagado",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: EBillingStatus) => {
    const colors = {
      [EBillingStatus.PENDING]: "bg-gray-100 text-gray-800",
      [EBillingStatus.PARTIAL]: "bg-yellow-100 text-yellow-800",
      [EBillingStatus.PAID]: "bg-green-100 text-green-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getPaymentMethodLabel = (method: EPaymentMethod) => {
    const labels: Record<EPaymentMethod, string> = {
      [EPaymentMethod.CASH]: "Efectivo",
      [EPaymentMethod.CREDIT_CARD]: "Tarjeta de Crédito",
      [EPaymentMethod.DEBIT_CARD]: "Tarjeta de Débito",
      [EPaymentMethod.TRANSFER]: "Transferencia",
      [EPaymentMethod.MERCADOPAGO]: "MercadoPago",
      [EPaymentMethod.CHECK]: "Cheque",
      [EPaymentMethod.CREDIT_NOTE]: "Nota de crédito",
    };
    return labels[method] || method;
  };

  const getFormaPagoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      efectivo: "Efectivo",
      transferencia: "Transferencia",
      cheque: "Cheque",
      cuenta_corriente: "Cuenta Corriente",
      canje: "Canje",
    };
    return labels[tipo] || tipo;
  };

  // Calcular nuevo estado basado en pagos
  const calculateBillingStatus = (totalAmount: number, totalPaid: number): EBillingStatus => {
    if (totalPaid === 0) {
      return EBillingStatus.PENDING;
    } else if (totalPaid >= totalAmount) {
      return EBillingStatus.PAID;
    } else {
      return EBillingStatus.PARTIAL;
    }
  };

  // Registrar nuevo pago
  const handleRegisterPayment = async () => {
    const amount = parseFloat(newPayment.amount);

    if (isNaN(amount) || amount <= 0) {
      toast.error("Ingrese un monto válido");
      return;
    }

    if (amount > billing.balance) {
      toast.error("El monto no puede ser mayor al saldo pendiente");
      return;
    }

    try {
      const newTotalPaid = billing.totalPaid + amount;
      const newBalance = billing.totalAmount - newTotalPaid;
      const newStatus = calculateBillingStatus(billing.totalAmount, newTotalPaid);

      const paymentRecord: TPaymentRecord = {
        id: `payment-${Date.now()}`,
        amount,
        date: new Date(),
        method: newPayment.method,
        banco: newPayment.method === EPaymentMethod.TRANSFER ? newPayment.banco : undefined,
        notes: newPayment.notes || undefined,
        registeredBy: user?.uid || '',
        registeredByName: user?.displayName || user?.email || undefined,
        createdAt: new Date(),
      };

      await updateDoc(billingRef, {
        totalPaid: newTotalPaid,
        balance: newBalance,
        status: newStatus,
        paymentHistory: arrayUnion(paymentRecord),
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      });

      toast.success("Pago registrado exitosamente");
      setShowPaymentModal(false);
      setNewPayment({
        amount: '',
        method: EPaymentMethod.CASH,
        banco: '',
        notes: '',
      });
    } catch (error) {
      console.error("Error registrando pago:", error);
      toast.error("Error al registrar el pago");
    }
  };

  // Mapear tipo de forma de pago a EPaymentMethod
  const mapFormaPagoToMethod = (tipo: string): EPaymentMethod => {
    const mapping: Record<string, EPaymentMethod> = {
      efectivo: EPaymentMethod.CASH,
      transferencia: EPaymentMethod.TRANSFER,
      cheque: EPaymentMethod.CHECK,
      cuenta_corriente: EPaymentMethod.CASH, // No hay equivalente exacto
      canje: EPaymentMethod.CASH, // No hay equivalente exacto
    };
    return mapping[tipo] || EPaymentMethod.CASH;
  };

  // Registrar pago rápido desde forma de pago
  const handleQuickPayment = async (formaPago: TBillingPaymentMethod) => {
    if (!formaPago.monto || formaPago.monto <= 0) {
      toast.error("Esta forma de pago no tiene monto definido");
      return;
    }

    if (formaPago.monto > billing.balance) {
      toast.error("El monto excede el saldo pendiente");
      return;
    }

    setProcessingPaymentId(formaPago.id);

    try {
      const amount = formaPago.monto;
      const newTotalPaid = billing.totalPaid + amount;
      const newBalance = billing.totalAmount - newTotalPaid;
      const newStatus = calculateBillingStatus(billing.totalAmount, newTotalPaid);

      const paymentRecord: TPaymentRecord = {
        id: `payment-${Date.now()}`,
        amount,
        date: new Date(),
        method: mapFormaPagoToMethod(formaPago.tipo),
        banco: formaPago.tipo === 'transferencia' ? formaPago.cuenta : undefined,
        notes: `Pago ${getFormaPagoLabel(formaPago.tipo)}${formaPago.factura ? ` - Factura ${formaPago.tipoFactura}` : ''}`,
        registeredBy: user?.uid || '',
        registeredByName: user?.displayName || user?.email || undefined,
        createdAt: new Date(),
      };

      await updateDoc(billingRef, {
        totalPaid: newTotalPaid,
        balance: newBalance,
        status: newStatus,
        paymentHistory: arrayUnion(paymentRecord),
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      });

      toast.success(`Pago de ${formatCurrency(amount)} registrado`);
    } catch (error) {
      console.error("Error registrando pago:", error);
      toast.error("Error al registrar el pago");
    } finally {
      setProcessingPaymentId(null);
    }
  };

  // Abrir modal de edición de formas de pago
  const handleOpenEditFormasPago = () => {
    setEditingFormasPago(billing.formasPago || []);
    setShowEditFormasPagoModal(true);
  };

  // Agregar nueva forma de pago
  const handleAddFormaPago = () => {
    setEditingFormasPago([
      ...editingFormasPago,
      {
        id: `fp-${Date.now()}`,
        tipo: 'efectivo',
        monto: 0,
        factura: false,
      }
    ]);
  };

  // Actualizar forma de pago
  const handleUpdateFormaPago = (index: number, field: string, value: any) => {
    const updated = [...editingFormasPago];
    updated[index] = { ...updated[index], [field]: value };
    setEditingFormasPago(updated);
  };

  // Eliminar forma de pago
  const handleRemoveFormaPago = (index: number) => {
    setEditingFormasPago(editingFormasPago.filter((_, i) => i !== index));
  };

  // Guardar formas de pago
  const handleSaveFormasPago = async () => {
    try {
      await updateDoc(billingRef, {
        formasPago: editingFormasPago,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      });
      toast.success("Formas de pago actualizadas");
      setShowEditFormasPagoModal(false);
    } catch (error) {
      console.error("Error actualizando formas de pago:", error);
      toast.error("Error al actualizar las formas de pago");
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center my-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Registro de facturación no encontrado</p>
        <Button asChild className="mt-4">
          <Link href="/publimar/viaPublica/facturacion">Volver a facturación</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{billing.number}</h1>
            <p className="text-sm text-slate-500">
              Presupuesto: {billing.quoteNumber}
            </p>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(billing.status)}`}>
            {getStatusLabel(billing.status)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            asChild
            variant="outline"
          >
            <Link href={`/publimar/viaPublica/presupuestos/${billing.quoteId}`}>
              Ver Presupuesto
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card de Cliente */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Datos del Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Nombre</p>
                  <p className="font-medium">{billing.client?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">CUIT</p>
                  <p className="font-medium font-mono tabular-nums">{formatCuit(billing.client?.cuit) || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Teléfono</p>
                  <p className="font-medium">{billing.client?.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Email</p>
                  <p className="font-medium">{billing.client?.email || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-slate-500">Dirección</p>
                  <p className="font-medium">{billing.client?.address || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card de Formas de Pago */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Formas de Pago
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenEditFormasPago}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Editar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {billing.formasPago && billing.formasPago.length > 0 ? (
                <div className="space-y-3">
                  {billing.formasPago.map((fp, index) => (
                    <div key={fp.id || index} className="p-3 bg-slate-50 rounded-lg space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{getFormaPagoLabel(fp.tipo)}</p>
                          {fp.cuenta && (
                            <p className="text-sm text-slate-500">Cuenta: {fp.cuenta}</p>
                          )}
                          {fp.factura && (
                            <p className="text-sm text-slate-500">
                              Factura: {fp.tipoFactura || 'Sí'}
                            </p>
                          )}
                        </div>
                        <p className="font-bold">{formatCurrency(fp.monto)}</p>
                      </div>
                      {billing.status !== EBillingStatus.PAID && fp.monto > 0 && (
                        <Button
                          size="sm"
                          className="w-full bg-green-600 hover:bg-green-700"
                          onClick={() => handleQuickPayment(fp)}
                          disabled={processingPaymentId === fp.id || fp.monto > billing.balance}
                        >
                          {processingPaymentId === fp.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Procesando...
                            </>
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              Pago realizado
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">Sin formas de pago definidas</p>
              )}
            </CardContent>
          </Card>

          {/* Historial de Pagos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Historial de Pagos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {billing.paymentHistory && billing.paymentHistory.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead className="hidden sm:table-cell">Banco</TableHead>
                      <TableHead className="hidden md:table-cell">Notas</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...billing.paymentHistory]
                      .sort((a, b) => {
                        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                        return dateB.getTime() - dateA.getTime();
                      })
                      .map((payment, index) => (
                        <TableRow key={payment.id || index}>
                          <TableCell>{formatDate(payment.date)}</TableCell>
                          <TableCell>{getPaymentMethodLabel(payment.method)}</TableCell>
                          <TableCell className="hidden sm:table-cell">{payment.banco || '-'}</TableCell>
                          <TableCell className="hidden md:table-cell text-slate-500">
                            {payment.notes || '-'}
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatCurrency(payment.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-slate-500 text-center py-8">No hay pagos registrados</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha */}
        <div className="space-y-6">
          {/* Card de Progreso de Pago */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Estado de Cuenta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progreso</span>
                  <span>{progressPercent.toFixed(0)}%</span>
                </div>
                <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total a cobrar</span>
                  <span className="font-bold">{formatCurrency(billing.totalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total pagado</span>
                  <span className="font-bold text-green-600">{formatCurrency(billing.totalPaid)}</span>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="text-slate-500">Saldo pendiente</span>
                  <span className="font-bold text-red-600">{formatCurrency(billing.balance)}</span>
                </div>
              </div>

              {billing.status !== EBillingStatus.PAID && availableCredit > 0 && (
                <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="h-4 w-4 text-amber-800" />
                    <span className="font-semibold text-amber-900 text-sm">
                      Saldo a favor del cliente: {formatearPrecio(availableCredit)}
                    </span>
                    <Badge className="bg-amber-200 text-amber-900 hover:bg-amber-200">
                      {availableNotes.length} nota{availableNotes.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <p className="text-xs text-amber-900 mb-2">
                    La nota se usa completa. Si supera el saldo pendiente, el sobrante se pierde.
                  </p>
                  <div className="flex flex-col gap-2">
                    {availableNotes.map((n) => {
                      const willForfeit = n.amount > billing.balance;
                      return (
                        <div
                          key={n.id}
                          className="flex items-center justify-between gap-2 rounded bg-white border border-amber-200 px-2 py-2"
                        >
                          <div className="text-sm">
                            <span className="font-medium">{n.number}</span>{" "}
                            <span className="font-semibold">
                              {formatearPrecio(n.amount)}
                            </span>
                            {willForfeit && (
                              <span className="block text-xs text-amber-700">
                                Sobrante perdido:{" "}
                                {formatearPrecio(n.amount - billing.balance)}
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            disabled={applyingNoteId === n.id}
                            onClick={() => handleApplyCreditNote(n.id)}
                          >
                            {applyingNoteId === n.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Aplicar"
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {billing.status !== EBillingStatus.PAID && (
                <Button
                  className="w-full mt-4 bg-green-600 hover:bg-green-700"
                  onClick={() => setShowPaymentModal(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Registrar Pago
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Card de Items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Items del Presupuesto
              </CardTitle>
            </CardHeader>
            <CardContent>
              {billing.items && billing.items.length > 0 ? (
                <div className="space-y-2">
                  {billing.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium text-sm">{item.productName}</p>
                        <p className="text-xs text-slate-500">
                          {item.quantity} x {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                      <p className="font-medium text-sm">{formatCurrency(item.subtotal)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">Sin items</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de Registrar Pago */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Monto</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={newPayment.amount}
                onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
              />
              <p className="text-xs text-slate-500">
                Saldo pendiente: {formatCurrency(billing.balance)}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select
                value={newPayment.method}
                onValueChange={(value) => setNewPayment({ ...newPayment, method: value as EPaymentMethod })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EPaymentMethod.CASH}>Efectivo</SelectItem>
                  <SelectItem value={EPaymentMethod.TRANSFER}>Transferencia</SelectItem>
                  <SelectItem value={EPaymentMethod.CHECK}>Cheque</SelectItem>
                  <SelectItem value={EPaymentMethod.CREDIT_CARD}>Tarjeta de Crédito</SelectItem>
                  <SelectItem value={EPaymentMethod.DEBIT_CARD}>Tarjeta de Débito</SelectItem>
                  <SelectItem value={EPaymentMethod.MERCADOPAGO}>MercadoPago</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newPayment.method === EPaymentMethod.TRANSFER && (
              <div className="space-y-2">
                <Label>Banco</Label>
                <Input
                  placeholder="Nombre del banco"
                  value={newPayment.banco}
                  onChange={(e) => setNewPayment({ ...newPayment, banco: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea
                placeholder="Notas adicionales..."
                value={newPayment.notes}
                onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRegisterPayment} className="bg-green-600 hover:bg-green-700">
              Registrar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Editar Formas de Pago */}
      <Dialog open={showEditFormasPagoModal} onOpenChange={setShowEditFormasPagoModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Formas de Pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {editingFormasPago.map((fp, index) => (
              <div key={fp.id || index} className="p-4 border rounded-lg space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Forma de Pago {index + 1}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleRemoveFormaPago(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={fp.tipo}
                      onValueChange={(value) => handleUpdateFormaPago(index, 'tipo', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                        <SelectItem value="canje">Canje</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Monto</Label>
                    <Input
                      type="number"
                      value={fp.monto}
                      onChange={(e) => handleUpdateFormaPago(index, 'monto', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  {fp.tipo === 'transferencia' && (
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Cuenta</Label>
                      <Input
                        value={fp.cuenta || ''}
                        onChange={(e) => handleUpdateFormaPago(index, 'cuenta', e.target.value)}
                        placeholder="Datos de la cuenta"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`factura-${index}`}
                      checked={fp.factura}
                      onChange={(e) => handleUpdateFormaPago(index, 'factura', e.target.checked)}
                      className="h-4 w-4"
                    />
                    <Label htmlFor={`factura-${index}`} className="text-xs">Factura</Label>
                  </div>

                  {fp.factura && (
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo Factura</Label>
                      <Select
                        value={fp.tipoFactura || ''}
                        onValueChange={(value) => handleUpdateFormaPago(index, 'tipoFactura', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">Factura A</SelectItem>
                          <SelectItem value="C">Factura C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              className="w-full"
              onClick={handleAddFormaPago}
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar Forma de Pago
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditFormasPagoModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveFormasPago}>
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
