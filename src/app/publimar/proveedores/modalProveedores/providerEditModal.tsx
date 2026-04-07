'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useFirestoreDocData } from 'reactfire';
import { doc, updateDoc } from 'firebase/firestore';
import { softDelete } from '@/lib/softDelete';
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
import { toast } from 'sonner';
import { TProvider } from '@/types/provider';
import { Save, Trash2, X } from 'lucide-react';

interface ProviderEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerId: string | null;
  onProviderUpdated?: () => void;
}

export default function ProviderEditModal({
  isOpen,
  onClose,
  providerId,
  onProviderUpdated,
}: ProviderEditModalProps) {
  const firestore = useFirestore();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState<Partial<TProvider>>({
    name: '',
    email: '',
    phone: '',
    address: '',
    cuit: '',
    contactPerson: '',
    notes: '',
  });

  // Obtener los datos del proveedor solo si providerId existe
  const shouldFetch = providerId !== null;
  const { status, data: provider } = useFirestoreDocData(
    shouldFetch ? doc(firestore, 'providers', providerId!) : doc(firestore, 'providers', 'dummy'),
    { idField: 'id' }
  );

  // Cargar datos del proveedor en el formulario
  useEffect(() => {
    if (provider && providerId) {
      setFormData({
        name: provider.name || '',
        email: provider.email || '',
        phone: provider.phone || '',
        address: provider.address || '',
        cuit: provider.cuit || '',
        contactPerson: provider.contactPerson || '',
        notes: provider.notes || '',
      });
    }
  }, [provider, providerId]);

  // Resetear formulario al cerrar
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        cuit: '',
        contactPerson: '',
        notes: '',
      });
    }
  }, [isOpen]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId) return;

    if (!formData.name?.trim()) {
      toast.error('El nombre del proveedor es requerido');
      return;
    }

    setLoading(true);
    try {
      const providerRef = doc(firestore, 'providers', providerId);
      await updateDoc(providerRef, {
        ...formData,
        updatedAt: new Date(),
      });

      toast.success('Proveedor actualizado correctamente');
      onProviderUpdated?.();
      onClose();
    } catch (error) {
      console.error('Error al actualizar proveedor:', error);
      toast.error('Error al actualizar el proveedor');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!providerId) return;

    const confirmDelete = window.confirm(
      '¿Estás seguro de que deseas eliminar este proveedor? Esta acción no se puede deshacer.'
    );

    if (!confirmDelete) return;

    setDeleting(true);
    try {
      await softDelete(firestore, 'providers', providerId);

      toast.success('Proveedor eliminado correctamente');
      onProviderUpdated?.();
      onClose();
    } catch (error) {
      console.error('Error al eliminar proveedor:', error);
      toast.error('Error al eliminar el proveedor');
    } finally {
      setDeleting(false);
    }
  };

  if (!providerId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Editar Proveedor</span>
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
                <Label htmlFor="name">Nombre/Razón Social *</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name || ''}
                  onChange={handleChange}
                  required
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email || ''}
                  onChange={handleChange}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone || ''}
                  onChange={handleChange}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuit">CUIT/CUIL</Label>
                <Input
                  id="cuit"
                  name="cuit"
                  value={formData.cuit || ''}
                  onChange={handleChange}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactPerson">Persona de Contacto</Label>
                <Input
                  id="contactPerson"
                  name="contactPerson"
                  value={formData.contactPerson || ''}
                  onChange={handleChange}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Dirección</Label>
                <Input
                  id="address"
                  name="address"
                  value={formData.address || ''}
                  onChange={handleChange}
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes || ''}
                onChange={handleChange}
                rows={3}
                className="w-full"
              />
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