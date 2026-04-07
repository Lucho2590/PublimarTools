'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useFirestoreDocData, useFirestoreCollectionData } from 'reactfire';
import { doc, updateDoc, collection } from 'firebase/firestore';
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
import { TPurchase, EPurchaseDepartment } from '@/types/purchase';
import { EUserRole } from '@/types/user';
import { Save, Trash2, X } from 'lucide-react';

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
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState<Partial<TPurchase>>({
    date: '',
    providerId: '',
    providerName: '',
    description: '',
    amount: 0,
    department: EPurchaseDepartment.BANDERAS,
  });

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
      // Si el usuario no es administración, forzar su departamento
      let department = purchase.department || EPurchaseDepartment.BANDERAS;
      if (userRole === EUserRole.BANDERAS) {
        department = EPurchaseDepartment.BANDERAS;
      } else if (userRole === EUserRole.VIA_PUBLICA) {
        department = EPurchaseDepartment.VIA_PUBLICA;
      } else if (userRole === EUserRole.ADMINISTRACION) {
        // Administración puede mantener el departamento de la compra
        department = purchase.department || EPurchaseDepartment.ADMINISTRACION;
      }
      
      setFormData({
        date: purchase.date || '',
        providerId: purchase.providerId || '',
        providerName: purchase.providerName || '',
        description: purchase.description || '',
        amount: purchase.amount || 0,
        department: department,
      });
    }
  }, [purchase, purchaseId, userRole]);

  // Resetear formulario al cerrar
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        date: '',
        providerId: '',
        providerName: '',
        description: '',
        amount: 0,
        department: EPurchaseDepartment.BANDERAS,
      });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseId) return;

    if (!formData.date || !formData.providerId || !formData.description || !formData.amount || !formData.department) {
      toast.error('Todos los campos son requeridos');
      return;
    }

    setLoading(true);
    try {
      const purchaseRef = doc(firestore, 'purchases', purchaseId);
      await updateDoc(purchaseRef, {
        ...formData,
        amount: Number(formData.amount),
        updatedAt: new Date(),
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
      '¿Estás seguro de que deseas eliminar esta compra? Esta acción no se puede deshacer.'
    );

    if (!confirmDelete) return;

    setDeleting(true);
    try {
      await softDelete(firestore, 'purchases', purchaseId);

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
                <Label htmlFor="description">Descripción *</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description || ''}
                  onChange={handleChange}
                  required
                  rows={3}
                  className="w-full"
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
                  disabled={(userRole !== EUserRole.ADMINISTRACION) && (userRole !== EUserRole.ADMIN)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {userRole === EUserRole.ADMINISTRACION || userRole === EUserRole.ADMIN ? (
                      // Administración puede ver y seleccionar todos los departamentos
                      <>
                        <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                        <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Vía Pública</SelectItem>
                        <SelectItem value={EPurchaseDepartment.ADMINISTRACION}>Administración</SelectItem>
                      </>
                    ) : userRole === EUserRole.BANDERAS ? (
                      // Banderas solo ve su departamento
                      <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                    ) : userRole === EUserRole.VIA_PUBLICA ? (
                      // Vía Pública solo ve su departamento
                      <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Vía Pública</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
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
