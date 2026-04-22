'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useFirestoreDocData, useFirestoreCollectionData } from 'reactfire';
import { doc, updateDoc, collection, query, where, getDocs, addDoc, increment, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { softDelete } from '@/lib/softDelete';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';
import { TPurchase, EPurchaseDepartment, EPurchasePaymentMethod } from '@/types/purchase';
import { EProviderAccountStatus } from '@/types/providerAccount';
import { EUserRole } from '@/types/user';
import { isAdminOrAbove } from '@/lib/permissions';
import { Save, Trash2, X, Paperclip, AlertCircle, Plus, CheckCircle, Camera, Upload } from 'lucide-react';
import { formatearPrecio } from '@/lib/utils';
import { useAuditLog } from '@/hooks/useAuditLog';
import { buildChanges } from '@/lib/auditLog';
import { EAuditAction, EAuditEntityType, EAuditSection } from '@/types/auditLog';

const PURCHASE_WATCHED_FIELDS = [
  'date', 'providerId', 'providerName', 'description',
  'amount', 'department', 'paymentMethod',
];

interface PurchaseEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseId: string | null;
  onPurchaseUpdated?: () => void;
}

export default function PurchaseEditModal({
  isOpen,
  onClose,
  purchaseId,
  onPurchaseUpdated,
}: PurchaseEditModalProps) {
  const firestore = useFirestore();
  const { userRole } = useAuth();
  const { logEvent } = useAuditLog();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState<Partial<TPurchase>>({
    date: '',
    providerId: '',
    providerName: '',
    description: '',
    amount: 0,
    department: EPurchaseDepartment.ADMINISTRACION,
    paymentMethod: undefined,
  });
  const [facturaFile, setFacturaFile] = useState<File | null>(null);
  const [removeFactura, setRemoveFactura] = useState(false);
  const [ccAccount, setCcAccount] = useState<any | null>(null);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccChecked, setCcChecked] = useState(false);
  const [originalPaymentMethod, setOriginalPaymentMethod] = useState<string | undefined>(undefined);
  const [originalAmount, setOriginalAmount] = useState<number>(0);

  // Obtener proveedores
  const providersCollection = collection(firestore, 'providers');
  const { data: providers } = useFirestoreCollectionData(providersCollection, { idField: 'id' });

  // Obtener los datos de la compra solo si purchaseId existe
  const shouldFetch = purchaseId !== null;
  const { status, data: purchase } = useFirestoreDocData(
    shouldFetch ? doc(firestore, 'purchases', purchaseId!) : doc(firestore, 'purchases', 'dummy'),
    { idField: 'id' }
  );

  // Cargar datos de la compra en el formulario
  useEffect(() => {
    if (purchase && purchaseId) {
      setFormData({
        date: purchase.date || '',
        providerId: purchase.providerId || '',
        providerName: purchase.providerName || '',
        description: purchase.description || '',
        amount: purchase.amount || 0,
        department: purchase.department || EPurchaseDepartment.ADMINISTRACION,
        paymentMethod: purchase.paymentMethod || undefined,
        facturaUrl: purchase.facturaUrl || undefined,
        facturaName: purchase.facturaName || undefined,
      });
      setOriginalPaymentMethod(purchase.paymentMethod || undefined);
      setOriginalAmount(purchase.amount || 0);
    }
  }, [purchase, purchaseId]);

  // Resetear formulario al cerrar
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        date: '',
        providerId: '',
        providerName: '',
        description: '',
        amount: 0,
        department: EPurchaseDepartment.ADMINISTRACION,
        paymentMethod: undefined,
        facturaUrl: undefined,
        facturaName: undefined,
      });
      setFacturaFile(null);
      setRemoveFactura(false);
      setCcAccount(null);
      setCcChecked(false);
      setCcLoading(false);
      setOriginalPaymentMethod(undefined);
      setOriginalAmount(0);
    }
  }, [isOpen]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'amount' ? Number(value) : value,
    }));
  };

  const handleProviderChange = (value: string) => {
    const provider = providers?.find((p: any) => p.id === value);
    setFormData((prev) => ({
      ...prev,
      providerId: value,
      providerName: provider?.name || '',
    }));
  };

  const handleDepartmentChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      department: value as EPurchaseDepartment,
    }));
  };

  // Verificar si el proveedor tiene CC activa
  const checkProviderCC = async (providerId: string) => {
    if (!providerId) {
      setCcAccount(null);
      setCcChecked(false);
      return;
    }
    setCcLoading(true);
    try {
      const ccQuery = query(
        collection(firestore, "providerAccounts"),
        where("providerId", "==", providerId),
        where("status", "==", EProviderAccountStatus.ACTIVE)
      );
      const snapshot = await getDocs(ccQuery);
      if (!snapshot.empty) {
        setCcAccount({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      } else {
        setCcAccount(null);
      }
      setCcChecked(true);
    } catch (error) {
      console.error("Error checking CC:", error);
      setCcAccount(null);
      setCcChecked(true);
    } finally {
      setCcLoading(false);
    }
  };

  const handleCreateCC = async () => {
    if (!formData.providerId) {
      toast.error("Seleccione un proveedor primero");
      return;
    }
    try {
      const provider = providers?.find((p: any) => p.id === formData.providerId);
      const docRef = await addDoc(collection(firestore, "providerAccounts"), {
        providerId: formData.providerId,
        providerName: provider?.name || formData.providerName || "",
        balance: 0,
        totalPurchases: 0,
        totalPayments: 0,
        status: EProviderAccountStatus.ACTIVE,
        createdBy: userRole || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCcAccount({ id: docRef.id, providerId: formData.providerId, providerName: provider?.name || formData.providerName || "", balance: 0, totalPurchases: 0, totalPayments: 0, status: EProviderAccountStatus.ACTIVE });
      toast.success("Cuenta Corriente creada correctamente");
    } catch (error) {
      console.error("Error creating CC:", error);
      toast.error("Error al crear la Cuenta Corriente");
    }
  };

  useEffect(() => {
    if (formData.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE && formData.providerId) {
      checkProviderCC(formData.providerId);
    } else {
      setCcAccount(null);
      setCcChecked(false);
    }
  }, [formData.paymentMethod, formData.providerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseId) return;

    if (!formData.date || !formData.providerId || !formData.description || !formData.amount || !formData.department) {
      toast.error('Todos los campos son requeridos');
      return;
    }

    setLoading(true);
    try {
      const beforeData = purchase as TPurchase | undefined;
      const purchaseRef = doc(firestore, 'purchases', purchaseId);
      await updateDoc(purchaseRef, {
        ...formData,
        amount: Number(formData.amount),
        updatedAt: new Date(),
      });

      // Manejar factura
      if (facturaFile) {
        const storageRef = ref(storage, `purchases/${purchaseId}/factura_${Date.now()}_${facturaFile.name}`);
        await uploadBytes(storageRef, facturaFile);
        const facturaUrl = await getDownloadURL(storageRef);
        await updateDoc(purchaseRef, { facturaUrl, facturaName: facturaFile.name });
      } else if (removeFactura && formData.facturaUrl) {
        try {
          const url = formData.facturaUrl;
          const path = decodeURIComponent(url.split('/o/')[1].split('?')[0]);
          await deleteObject(ref(storage, path));
        } catch (e) { console.error("Error deleting factura:", e); }
        await updateDoc(purchaseRef, { facturaUrl: null, facturaName: null });
      }

      // Ajustar CC si cambió la forma de pago o el monto
      const wasCC = originalPaymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE;
      const isCC = formData.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE;
      const newAmount = Number(formData.amount);

      if (wasCC && !isCC) {
        // Cambió de CC a otra forma: decrementar el monto original
        const ccQuery = query(
          collection(firestore, "providerAccounts"),
          where("providerId", "==", formData.providerId),
          where("status", "==", EProviderAccountStatus.ACTIVE)
        );
        const snapshot = await getDocs(ccQuery);
        if (!snapshot.empty) {
          const ccRef = doc(firestore, "providerAccounts", snapshot.docs[0].id);
          await updateDoc(ccRef, {
            balance: increment(-originalAmount),
            totalPurchases: increment(-originalAmount),
            updatedAt: serverTimestamp(),
          });
        }
      } else if (!wasCC && isCC && ccAccount) {
        // Cambió de otra forma a CC: incrementar el nuevo monto
        const ccRef = doc(firestore, "providerAccounts", ccAccount.id);
        await updateDoc(ccRef, {
          balance: increment(newAmount),
          totalPurchases: increment(newAmount),
          updatedAt: serverTimestamp(),
        });
      } else if (wasCC && isCC && ccAccount) {
        // Sigue siendo CC pero puede haber cambiado el monto
        const delta = newAmount - originalAmount;
        if (delta !== 0) {
          const ccRef = doc(firestore, "providerAccounts", ccAccount.id);
          await updateDoc(ccRef, {
            balance: increment(delta),
            totalPurchases: increment(delta),
            updatedAt: serverTimestamp(),
          });
        }
      }

      const afterData = {
        ...formData,
        amount: Number(formData.amount),
      };
      const changes = buildChanges(beforeData as any, afterData as any, PURCHASE_WATCHED_FIELDS);
      const changedFields = Object.keys(changes.after ?? {});
      const highlightDate = changedFields.includes('date')
        ? ` — fecha: ${beforeData?.date ?? ''} → ${afterData.date ?? ''}`
        : '';
      await logEvent({
        section: EAuditSection.ADMINISTRACION,
        entityType: EAuditEntityType.PURCHASE,
        entityId: purchaseId,
        entityLabel: beforeData?.description?.slice(0, 40) ?? null,
        action: EAuditAction.UPDATE,
        description: changedFields.length
          ? `Editó la compra (${changedFields.join(', ')})${highlightDate}`.trim()
          : `Editó la compra`,
        changes,
        metadata: {
          providerId: afterData.providerId,
          providerName: afterData.providerName,
          amount: afterData.amount,
        },
      });

      toast.success('Compra actualizada correctamente');
      onPurchaseUpdated?.();
      onClose();
    } catch (error) {
      console.error('Error al actualizar compra:', error);
      toast.error('Error al actualizar la compra');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!purchaseId) return;

    const confirmDelete = window.confirm(
      '¿Estas seguro de que deseas eliminar esta compra? Esta accion no se puede deshacer.'
    );

    if (!confirmDelete) return;

    setDeleting(true);
    try {
      const beforeData = purchase as TPurchase | undefined;
      await softDelete(firestore, 'purchases', purchaseId);

      await logEvent({
        section: EAuditSection.ADMINISTRACION,
        entityType: EAuditEntityType.PURCHASE,
        entityId: purchaseId,
        entityLabel: beforeData?.description?.slice(0, 40) ?? null,
        action: EAuditAction.DELETE,
        description: `Eliminó la compra${beforeData?.providerName ? ' a ' + beforeData.providerName : ''}`,
        metadata: {
          providerId: beforeData?.providerId,
          providerName: beforeData?.providerName,
          amount: beforeData?.amount,
          date: beforeData?.date,
        },
      });

      // Si era CC, decrementar el saldo
      if (formData.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE && formData.providerId) {
        const ccQuery = query(
          collection(firestore, "providerAccounts"),
          where("providerId", "==", formData.providerId),
          where("status", "==", EProviderAccountStatus.ACTIVE)
        );
        const snapshot = await getDocs(ccQuery);
        if (!snapshot.empty) {
          const ccRef = doc(firestore, "providerAccounts", snapshot.docs[0].id);
          await updateDoc(ccRef, {
            balance: increment(-Number(formData.amount)),
            totalPurchases: increment(-Number(formData.amount)),
            updatedAt: serverTimestamp(),
          });
        }
      }

      toast.success('Compra eliminada correctamente');
      onPurchaseUpdated?.();
      onClose();
    } catch (error) {
      console.error('Error al eliminar compra:', error);
      toast.error('Error al eliminar la compra');
    } finally {
      setDeleting(false);
    }
  };

  if (!purchaseId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Editar Compra</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {status === 'loading' ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-slate-900"></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Fecha *</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  value={formData.date || ''}
                  onChange={handleChange}
                  required
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="providerId">Proveedor *</Label>
                <Select
                  value={formData.providerId || ''}
                  onValueChange={handleProviderChange}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers && providers.map((provider: any) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Descripcion *</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description || ''}
                  onChange={handleChange}
                  required
                  rows={3}
                  className="w-full"
                  placeholder="Descripcion de la compra..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Monto *</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.amount || ''}
                  onChange={handleChange}
                  required
                  className="w-full"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Departamento *</Label>
                <Select
                  value={formData.department || ''}
                  onValueChange={handleDepartmentChange}
                  required
                  disabled={!isAdminOrAbove(userRole)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {isAdminOrAbove(userRole) ? (
                      <>
                        <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                        <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Via Publica</SelectItem>
                        <SelectItem value={EPurchaseDepartment.ADMINISTRACION}>Administracion</SelectItem>
                      </>
                    ) : userRole === EUserRole.BANDERAS ? (
                      <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                    ) : userRole === EUserRole.VIA_PUBLICA ? (
                      <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Via Publica</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Forma de Pago</Label>
                <Select
                  value={formData.paymentMethod || ''}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, paymentMethod: value as EPurchasePaymentMethod }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar forma de pago" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EPurchasePaymentMethod.EFECTIVO}>Efectivo</SelectItem>
                    <SelectItem value={EPurchasePaymentMethod.TARJETA}>Tarjeta</SelectItem>
                    <SelectItem value={EPurchasePaymentMethod.TRANSFERENCIA}>Transferencia</SelectItem>
                    <SelectItem value={EPurchasePaymentMethod.CUENTA_CORRIENTE}>Cuenta Corriente</SelectItem>
                    <SelectItem value={EPurchasePaymentMethod.CHEQUE}>Cheque</SelectItem>
                    <SelectItem value={EPurchasePaymentMethod.ECHEQ}>E-Cheq</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* CC Status */}
              {formData.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE && (
                <div className="md:col-span-2">
                  {!formData.providerId ? (
                    <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm text-yellow-700">Seleccione un proveedor primero.</span>
                    </div>
                  ) : ccLoading ? (
                    <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-md">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-slate-600"></div>
                      <span className="text-sm text-slate-600">Verificando Cuenta Corriente...</span>
                    </div>
                  ) : ccChecked && ccAccount ? (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-700">CC activa — Saldo pendiente: <strong>{formatearPrecio(ccAccount.balance || 0)}</strong></span>
                    </div>
                  ) : ccChecked && !ccAccount ? (
                    <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-md">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-orange-600" />
                        <span className="text-sm text-orange-700">Este proveedor no tiene una Cuenta Corriente activa.</span>
                      </div>
                      <Button type="button" size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-100" onClick={handleCreateCC}>
                        <Plus className="h-3 w-3 mr-1" /> Crear CC
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label>Factura</Label>
                {formData.facturaUrl && !removeFactura ? (
                  <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border">
                    <Paperclip className="h-4 w-4 text-blue-600" />
                    <a href={formData.facturaUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex-1 truncate">
                      {formData.facturaName || "Ver factura"}
                    </a>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRemoveFactura(true)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        id="facturaEdit"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          setFacturaFile(e.target.files?.[0] || null);
                          setRemoveFactura(false);
                        }}
                        className="hidden"
                      />
                      <input
                        id="facturaEditCamera"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          setFacturaFile(e.target.files?.[0] || null);
                          setRemoveFactura(false);
                        }}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="md:hidden flex-1"
                        onClick={() => document.getElementById('facturaEditCamera')?.click()}
                      >
                        <Camera className="h-4 w-4 mr-2" /> Tomar foto
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => document.getElementById('facturaEdit')?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" /> Cargar archivo
                      </Button>
                      {facturaFile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setFacturaFile(null);
                            const input = document.getElementById('facturaEdit') as HTMLInputElement;
                            if (input) input.value = '';
                            const cam = document.getElementById('facturaEditCamera') as HTMLInputElement;
                            if (cam) cam.value = '';
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {facturaFile && (
                      <p className="text-sm text-slate-500 flex items-center gap-1">
                        <Paperclip className="h-3 w-3" /> {facturaFile.name}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting || loading}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={loading || deleting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading || deleting}
                  className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
