'use client';

import { useState, useEffect, useRef } from 'react';
import { useFirestore, useFirestoreCollectionData } from 'reactfire';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  where,
  getDocs,
  increment,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
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
} from '@/components/ui/select';
import { toast } from 'sonner';
import { TPurchase, EPurchaseDepartment, EPurchasePaymentMethod } from '@/types/purchase';
import { EProviderAccountStatus } from '@/types/providerAccount';
import { EUserRole } from '@/types/user';
import { isAdminOrAbove } from '@/lib/permissions';
import { formatearPrecio } from '@/lib/utils';
import {
  Save,
  X,
  Paperclip,
  AlertCircle,
  Plus,
  CheckCircle,
  Camera,
  Upload,
  Loader2,
} from 'lucide-react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { buildChanges } from '@/lib/auditLog';
import { EAuditAction, EAuditEntityType, EAuditSection } from '@/types/auditLog';

interface PurchaseCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function PurchaseCreateModal({
  isOpen,
  onClose,
  onCreated,
}: PurchaseCreateModalProps) {
  const firestore = useFirestore();
  const { userRole } = useAuth();
  const { logEvent } = useAuditLog();

  const buildInitialForm = (): Partial<TPurchase> => {
    const base: Partial<TPurchase> = { date: new Date().toISOString().split('T')[0] };
    if (userRole === EUserRole.BANDERAS) base.department = EPurchaseDepartment.BANDERAS;
    else if (userRole === EUserRole.VIA_PUBLICA) base.department = EPurchaseDepartment.VIA_PUBLICA;
    else if (isAdminOrAbove(userRole)) base.department = EPurchaseDepartment.ADMINISTRACION;
    return base;
  };

  const [form, setForm] = useState<Partial<TPurchase>>(buildInitialForm);
  const [loading, setLoading] = useState(false);
  const [facturaFile, setFacturaFile] = useState<File | null>(null);

  const [ccAccount, setCcAccount] = useState<any | null>(null);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccChecked, setCcChecked] = useState(false);

  const [providerInput, setProviderInput] = useState('');
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [highlightedProviderIndex, setHighlightedProviderIndex] = useState(-1);
  const providerInputRef = useRef<HTMLInputElement>(null);

  const providersCollection = collection(firestore, 'providers');
  const providersQuery = query(providersCollection, orderBy('name'));
  const { data: providers } = useFirestoreCollectionData(providersQuery, { idField: 'id' });

  useEffect(() => {
    if (userRole) {
      setForm((prev) => {
        const next = { ...prev };
        if (userRole === EUserRole.BANDERAS) next.department = EPurchaseDepartment.BANDERAS;
        else if (userRole === EUserRole.VIA_PUBLICA) next.department = EPurchaseDepartment.VIA_PUBLICA;
        else if (isAdminOrAbove(userRole)) next.department = EPurchaseDepartment.ADMINISTRACION;
        return next;
      });
    }
  }, [userRole]);

  useEffect(() => {
    if (!isOpen) {
      setForm(buildInitialForm());
      setProviderInput('');
      setFacturaFile(null);
      setCcAccount(null);
      setCcChecked(false);
      setCcLoading(false);
      setShowProviderDropdown(false);
      setHighlightedProviderIndex(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleDepartmentChange = (value: string) => {
    setForm({ ...form, department: value as EPurchaseDepartment });
  };

  const handleProviderInputChange = (value: string) => {
    setProviderInput(value);
    setShowProviderDropdown(true);
    setHighlightedProviderIndex(-1);
  };

  const handleSelectProvider = (providerId: string, providerName: string) => {
    setForm({ ...form, providerId });
    setProviderInput(providerName);
    setShowProviderDropdown(false);
    setHighlightedProviderIndex(-1);
  };

  const handleProviderKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const filteredProviders =
      providers?.filter((p: any) =>
        p.name.toLowerCase().includes(providerInput.toLowerCase())
      ) || [];

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedProviderIndex((prev) =>
        prev < filteredProviders.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedProviderIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && highlightedProviderIndex >= 0) {
      e.preventDefault();
      const selected = filteredProviders[highlightedProviderIndex];
      handleSelectProvider(selected.id, selected.name);
      if (providerInputRef.current) providerInputRef.current.blur();
    }
  };

  const checkProviderCC = async (providerId: string) => {
    if (!providerId) {
      setCcAccount(null);
      setCcChecked(false);
      return;
    }
    setCcLoading(true);
    try {
      const ccQuery = query(
        collection(firestore, 'providerAccounts'),
        where('providerId', '==', providerId),
        where('status', '==', EProviderAccountStatus.ACTIVE)
      );
      const snapshot = await getDocs(ccQuery);
      if (!snapshot.empty) {
        setCcAccount({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      } else {
        setCcAccount(null);
      }
      setCcChecked(true);
    } catch (error) {
      console.error('Error checking CC:', error);
      setCcAccount(null);
      setCcChecked(true);
    } finally {
      setCcLoading(false);
    }
  };

  const handleCreateCC = async () => {
    if (!form.providerId) {
      toast.error('Seleccione un proveedor primero');
      return;
    }
    try {
      const provider = providers?.find((p: any) => p.id === form.providerId);
      const docRef = await addDoc(collection(firestore, 'providerAccounts'), {
        providerId: form.providerId,
        providerName: provider?.name || '',
        balance: 0,
        totalPurchases: 0,
        totalPayments: 0,
        status: EProviderAccountStatus.ACTIVE,
        createdBy: userRole || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCcAccount({
        id: docRef.id,
        providerId: form.providerId,
        providerName: provider?.name || '',
        balance: 0,
        totalPurchases: 0,
        totalPayments: 0,
        status: EProviderAccountStatus.ACTIVE,
      });
      toast.success('Cuenta Corriente creada correctamente');
    } catch (error) {
      console.error('Error creating CC:', error);
      toast.error('Error al crear la Cuenta Corriente');
    }
  };

  useEffect(() => {
    if (form.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE && form.providerId) {
      checkProviderCC(form.providerId);
    } else {
      setCcAccount(null);
      setCcChecked(false);
    }
  }, [form.paymentMethod, form.providerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.date || !form.providerId || !form.description || !form.amount || !form.department) {
      toast.error('Todos los campos son requeridos');
      return;
    }

    if (form.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE && !ccAccount) {
      toast.error('El proveedor no tiene una Cuenta Corriente activa. Cree una primero.');
      return;
    }

    setLoading(true);
    try {
      const provider = providers?.find((p: any) => p.id === form.providerId);
      const createPayload = {
        ...form,
        providerName: provider?.name || '',
        date: form.date,
        amount: Number(form.amount),
      };
      const purchasesCollection = collection(firestore, 'purchases');
      const docRef = await addDoc(purchasesCollection, {
        ...createPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await logEvent({
        section: EAuditSection.BANDERAS_COMPRAS,
        entityType: EAuditEntityType.PURCHASE,
        entityId: docRef.id,
        entityLabel: (createPayload.description ?? '').slice(0, 40) || null,
        action: EAuditAction.CREATE,
        description:
          `Creó una compra a ${createPayload.providerName ?? ''} por $${createPayload.amount}`.trim(),
        changes: buildChanges(null, createPayload as any, [
          'date',
          'providerId',
          'providerName',
          'description',
          'amount',
          'department',
          'paymentMethod',
        ]),
        metadata: {
          providerId: createPayload.providerId,
          providerName: createPayload.providerName,
          amount: createPayload.amount,
        },
      });

      if (facturaFile) {
        const storageRef = ref(
          storage,
          `purchases/${docRef.id}/factura_${Date.now()}_${facturaFile.name}`
        );
        await uploadBytes(storageRef, facturaFile);
        const facturaUrl = await getDownloadURL(storageRef);
        await updateDoc(docRef, { facturaUrl, facturaName: facturaFile.name });
      }

      if (form.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE && ccAccount) {
        const ccRef = doc(firestore, 'providerAccounts', ccAccount.id);
        await updateDoc(ccRef, {
          balance: increment(Number(form.amount)),
          totalPurchases: increment(Number(form.amount)),
          updatedAt: serverTimestamp(),
        });
      }

      toast.success('Compra registrada correctamente');
      onCreated?.();
      onClose();
    } catch (error) {
      console.error('Error al guardar compra:', error);
      toast.error('Error al guardar compra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva compra</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Fecha *</Label>
              <Input
                id="date"
                name="date"
                type="date"
                value={form.date || ''}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="providerId">Proveedor *</Label>
              <div className="relative">
                <Input
                  ref={providerInputRef}
                  placeholder="Buscar o seleccionar proveedor..."
                  value={providerInput}
                  onChange={(e) => handleProviderInputChange(e.target.value)}
                  onKeyDown={handleProviderKeyDown}
                  onFocus={() => {
                    setShowProviderDropdown(true);
                    setHighlightedProviderIndex(-1);
                  }}
                  onBlur={() =>
                    setTimeout(() => {
                      setShowProviderDropdown(false);
                      setHighlightedProviderIndex(-1);
                    }, 150)
                  }
                  required
                />
                {showProviderDropdown && providers && providers.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-sm">
                    {providers
                      .filter((p: any) =>
                        p.name.toLowerCase().includes(providerInput.toLowerCase())
                      )
                      .map((p: any, index: number) => (
                        <li
                          key={p.id}
                          className={`cursor-pointer rounded-md px-2 py-1.5 text-sm transition-colors ${
                            index === highlightedProviderIndex
                              ? 'bg-slate-100'
                              : 'hover:bg-slate-50'
                          }`}
                          onMouseEnter={() => setHighlightedProviderIndex(index)}
                          onMouseDown={() => {
                            handleSelectProvider(p.id, p.name);
                            if (providerInputRef.current) providerInputRef.current.blur();
                          }}
                        >
                          {p.name}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Descripción *</Label>
              <Textarea
                id="description"
                name="description"
                value={form.description || ''}
                onChange={handleChange}
                rows={3}
                required
                placeholder="Descripción de la compra..."
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
                value={form.amount || ''}
                onChange={handleChange}
                required
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Departamento *</Label>
              <Select
                value={form.department || ''}
                onValueChange={handleDepartmentChange}
                required
                disabled={!isAdminOrAbove(userRole)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar departamento" />
                </SelectTrigger>
                <SelectContent>
                  {isAdminOrAbove(userRole) ? (
                    <>
                      <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                      <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Vía Pública</SelectItem>
                      <SelectItem value={EPurchaseDepartment.ADMINISTRACION}>
                        Administración
                      </SelectItem>
                    </>
                  ) : userRole === EUserRole.BANDERAS ? (
                    <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                  ) : userRole === EUserRole.VIA_PUBLICA ? (
                    <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Vía Pública</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Forma de pago</Label>
              <Select
                value={form.paymentMethod || ''}
                onValueChange={(value) =>
                  setForm({ ...form, paymentMethod: value as EPurchasePaymentMethod })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar forma de pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EPurchasePaymentMethod.EFECTIVO}>Efectivo</SelectItem>
                  <SelectItem value={EPurchasePaymentMethod.TARJETA}>Tarjeta</SelectItem>
                  <SelectItem value={EPurchasePaymentMethod.TRANSFERENCIA}>
                    Transferencia
                  </SelectItem>
                  <SelectItem value={EPurchasePaymentMethod.CUENTA_CORRIENTE}>
                    Cuenta Corriente
                  </SelectItem>
                  <SelectItem value={EPurchasePaymentMethod.CHEQUE}>Cheque</SelectItem>
                  <SelectItem value={EPurchasePaymentMethod.ECHEQ}>E-Cheq</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE && (
              <div className="md:col-span-2">
                {!form.providerId ? (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-amber-700">
                      Seleccione un proveedor primero para verificar su Cuenta Corriente.
                    </span>
                  </div>
                ) : ccLoading ? (
                  <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
                    <span className="text-sm text-slate-600">Verificando Cuenta Corriente...</span>
                  </div>
                ) : ccChecked && ccAccount ? (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm text-emerald-700">
                      CC activa — Saldo pendiente:{' '}
                      <strong>{formatearPrecio(ccAccount.balance || 0)}</strong>
                    </span>
                  </div>
                ) : ccChecked && !ccAccount ? (
                  <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-md">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                      <span className="text-sm text-orange-700">
                        Este proveedor no tiene una Cuenta Corriente activa.
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-orange-300 text-orange-700 hover:bg-orange-100"
                      onClick={handleCreateCC}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Crear CC
                    </Button>
                  </div>
                ) : null}
              </div>
            )}

            <div className="space-y-2 md:col-span-2">
              <Label>Factura (PDF o imagen)</Label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  id="factura"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setFacturaFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <input
                  id="facturaCamera"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setFacturaFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="md:hidden flex-1"
                  onClick={() => document.getElementById('facturaCamera')?.click()}
                >
                  <Camera className="h-4 w-4 mr-2" /> Tomar foto
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => document.getElementById('factura')?.click()}
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
                      const input = document.getElementById('factura') as HTMLInputElement;
                      if (input) input.value = '';
                      const cam = document.getElementById('facturaCamera') as HTMLInputElement;
                      if (cam) cam.value = '';
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {facturaFile && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Paperclip className="h-3 w-3" /> {facturaFile.name}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex items-center gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {loading ? 'Guardando...' : 'Registrar compra'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
