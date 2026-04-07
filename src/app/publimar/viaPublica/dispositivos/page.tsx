'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore, useFirestoreCollectionData } from 'reactfire';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { softDelete } from '@/lib/softDelete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import collections from '@/lib/collections';
import { Trash2, Edit } from 'lucide-react';
import { TDeviceType } from '@/types/device';

export default function DispositivosPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ name: '', description: '', afiche: '' });
  const [editingDevice, setEditingDevice] = useState<{
    id: string;
    name: string;
    description: string;
    afiche: string;
  } | null>(null);
  const firestore = useFirestore();

  const devicesCollection = collection(firestore, collections.DEVICES);
  const { data: devices } = useFirestoreCollectionData(devicesCollection, {
    idField: 'id',
  });

  const handleAddDevice = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre del dispositivo no puede estar vacio');
      return;
    }

    try {
      await addDoc(devicesCollection, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        afiche: formData.afiche ? parseInt(formData.afiche) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setFormData({ name: '', description: '', afiche: '' });
      toast.success('Tipo de dispositivo creado con exito');
    } catch (error) {
      console.error('Error al crear el dispositivo:', error);
      toast.error('Error al crear el tipo de dispositivo');
    }
  };

  const handleEditDevice = async () => {
    if (!editingDevice?.name.trim()) {
      toast.error('El nombre del dispositivo no puede estar vacio');
      return;
    }

    try {
      const deviceRef = doc(firestore, collections.DEVICES, editingDevice.id);
      await updateDoc(deviceRef, {
        name: editingDevice.name.trim(),
        description: editingDevice.description.trim(),
        afiche: editingDevice.afiche ? parseInt(editingDevice.afiche) : null,
        updatedAt: serverTimestamp(),
      });
      setEditingDevice(null);
      toast.success('Tipo de dispositivo actualizado con exito');
    } catch (error) {
      console.error('Error al actualizar el dispositivo:', error);
      toast.error('Error al actualizar el tipo de dispositivo');
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('Estas seguro de que quieres eliminar este tipo de dispositivo?')) {
      return;
    }

    try {
      await softDelete(firestore, collections.DEVICES, deviceId);
      toast.success('Tipo de dispositivo eliminado con exito');
    } catch (error) {
      console.error('Error al eliminar el dispositivo:', error);
      toast.error('Error al eliminar el tipo de dispositivo');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tipos de Dispositivos</h1>
        <Button variant="outline" onClick={() => router.back()}>
          Volver
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            {editingDevice ? 'Editar Tipo de Dispositivo' : 'Nuevo Tipo de Dispositivo'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="deviceName">Nombre del tipo de dispositivo</Label>
              <Input
                id="deviceName"
                value={editingDevice ? editingDevice.name : formData.name}
                onChange={(e) =>
                  editingDevice
                    ? setEditingDevice({
                        ...editingDevice,
                        name: e.target.value,
                      })
                    : setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Ej: Simple, Doble, Pantalla LED, etc."
              />
            </div>
            <div>
              <Label htmlFor="deviceDescription">Descripcion (opcional)</Label>
              <Textarea
                id="deviceDescription"
                value={editingDevice ? editingDevice.description : formData.description}
                onChange={(e) =>
                  editingDevice
                    ? setEditingDevice({
                        ...editingDevice,
                        description: e.target.value,
                      })
                    : setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Ej: Cartel publicitario de una cara"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="deviceAfiche">Cantidad de Afiches</Label>
              <Input
                id="deviceAfiche"
                type="number"
                min="0"
                value={editingDevice ? editingDevice.afiche : formData.afiche}
                onChange={(e) =>
                  editingDevice
                    ? setEditingDevice({
                        ...editingDevice,
                        afiche: e.target.value,
                      })
                    : setFormData({ ...formData, afiche: e.target.value })
                }
                placeholder="Ej: 2"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          {editingDevice ? (
            <>
              <Button onClick={handleEditDevice} className="mr-2">
                Guardar Cambios
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditingDevice(null)}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <Button onClick={handleAddDevice}>Agregar Tipo de Dispositivo</Button>
          )}
        </CardFooter>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-10">Nombre</TableHead>
                <TableHead>Descripcion</TableHead>
                <TableHead className="text-center">Afiches</TableHead>
                <TableHead className="pr-10 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices
                ?.sort((a, b) => a.name.localeCompare(b.name))
                ?.map((device) => {
                const typedDevice = device as unknown as TDeviceType;
                return (
                  <TableRow key={typedDevice.id}>
                    <TableCell className="pl-10 font-medium">{typedDevice.name}</TableCell>
                    <TableCell className="text-gray-600">
                      {typedDevice.description || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {typedDevice.afiche ?? '-'}
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <Button
                        onClick={() =>
                          setEditingDevice({
                            id: typedDevice.id,
                            name: typedDevice.name,
                            description: typedDevice.description || '',
                            afiche: typedDevice.afiche?.toString() || '',
                          })
                        }
                        variant="ghost"
                        size="icon"
                        title="Editar"
                        className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteDevice(typedDevice.id)}
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
