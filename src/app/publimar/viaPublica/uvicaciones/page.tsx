'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useFirestore, useFirestoreCollectionData } from 'reactfire';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { MapPin, Plus, Trash2, Edit, X } from 'lucide-react';
import collections from '@/lib/collections';

const MapView = dynamic(() => import('@/components/maps/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-gray-100 rounded-lg flex items-center justify-center">
      <p className="text-gray-500">Cargando mapa...</p>
    </div>
  ),
});

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  address?: string;
  createdAt?: Date;
}

export default function UbicacionesPage() {
  const firestore = useFirestore();
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [draggableMarker, setDraggableMarker] = useState<{ lat: number; lng: number } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    address: '',
    lat: '',
    lng: '',
  });

  const locationsCollection = collection(firestore, collections.LOCATIONS || 'locations');
  const { data: locationsData, status } = useFirestoreCollectionData(locationsCollection, {
    idField: 'id',
  });

  const locations: Location[] = (locationsData as any[])?.map((loc) => ({
    id: loc.id,
    name: loc.name,
    lat: loc.lat,
    lng: loc.lng,
    description: loc.description,
    address: loc.address,
    createdAt: loc.createdAt?.toDate?.(),
  })) || [];

  const handleNewLocation = () => {
    // Posicion inicial del marcador (centro de Buenos Aires por defecto)
    const initialPosition = locations.length > 0
      ? { lat: locations[0].lat, lng: locations[0].lng }
      : { lat: -34.6037, lng: -58.3816 };

    setDraggableMarker(initialPosition);
    setFormData({
      name: '',
      description: '',
      address: '',
      lat: initialPosition.lat.toFixed(6),
      lng: initialPosition.lng.toFixed(6),
    });
    setShowDrawer(true);
  };

  const handleDraggableMarkerMove = (lat: number, lng: number) => {
    setDraggableMarker({ lat, lng });
    setFormData(prev => ({
      ...prev,
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.lat || !formData.lng) {
      toast.error('Nombre y coordenadas son requeridos');
      return;
    }

    try {
      const locationData = {
        name: formData.name,
        description: formData.description,
        address: formData.address,
        lat: parseFloat(formData.lat),
        lng: parseFloat(formData.lng),
        createdAt: new Date(),
      };

      if (editingLocation) {
        await updateDoc(doc(firestore, collections.LOCATIONS || 'locations', editingLocation.id), locationData);
        toast.success('Ubicacion actualizada correctamente');
      } else {
        await addDoc(collection(firestore, collections.LOCATIONS || 'locations'), locationData);
        toast.success('Ubicacion agregada correctamente');
      }

      handleCloseDrawer();
    } catch (error) {
      console.error('Error al guardar ubicacion:', error);
      toast.error('Error al guardar la ubicacion');
    }
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setDraggableMarker({ lat: location.lat, lng: location.lng });
    setFormData({
      name: location.name,
      description: location.description || '',
      address: location.address || '',
      lat: location.lat.toString(),
      lng: location.lng.toString(),
    });
    setShowDrawer(true);
  };

  const handleDelete = async (locationId: string) => {
    if (!confirm('Estas seguro de eliminar esta ubicacion?')) return;

    try {
      await deleteDoc(doc(firestore, collections.LOCATIONS || 'locations', locationId));
      toast.success('Ubicacion eliminada correctamente');
    } catch (error) {
      console.error('Error al eliminar ubicacion:', error);
      toast.error('Error al eliminar la ubicacion');
    }
  };

  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setEditingLocation(null);
    setDraggableMarker(null);
    setFormData({
      name: '',
      description: '',
      address: '',
      lat: '',
      lng: '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Ubicaciones</h1>
        <Button onClick={handleNewLocation} className="bg-blue-900 hover:bg-blue-800">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Ubicacion
        </Button>
      </div>

      {/* Mapa a pantalla completa */}
      <div className="h-[calc(100vh-200px)] w-full">
        {status === 'loading' ? (
          <div className="h-full w-full bg-gray-100 rounded-lg flex items-center justify-center">
            <p className="text-gray-500">Cargando ubicaciones...</p>
          </div>
        ) : (
          <MapView
            locations={locations}
            center={locations.length > 0 ? [locations[0].lat, locations[0].lng] : undefined}
            draggableMarker={draggableMarker}
            onDraggableMarkerMove={handleDraggableMarkerMove}
          />
        )}
      </div>

      {/* Lista de ubicaciones */}
      <Card>
        <CardHeader>
          <CardTitle>Ubicaciones Registradas ({locations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {locations.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No hay ubicaciones registradas</p>
              <p className="text-sm text-gray-400 mt-2">
                Agrega tu primera ubicacion haciendo click en Nueva Ubicacion
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Direccion</TableHead>
                  <TableHead>Coordenadas</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="font-medium">{location.name}</TableCell>
                    <TableCell>{location.address || '-'}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(location)}
                          className="hover:bg-blue-50"
                        >
                          <Edit className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(location.id)}
                          className="hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drawer lateral derecho */}
      <Sheet open={showDrawer} onOpenChange={setShowDrawer}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-y-auto" hideOverlay>
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>
                {editingLocation ? 'Editar Ubicacion' : 'Nueva Ubicacion'}
              </SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCloseDrawer}
                className="h-6 w-6"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SheetDescription>
              {editingLocation
                ? 'Modifica los datos de la ubicacion y mueve el marcador rojo en el mapa'
                : 'Arrastra el marcador rojo en el mapa para seleccionar la ubicacion'}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Oficina Central"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Direccion</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Ej: Av. Corrientes 1234, CABA"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripcion</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detalles adicionales sobre la ubicacion"
                rows={3}
              />
            </div>

            <div className="space-y-4">
              <Label>Coordenadas</Label>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-blue-800">
                  <MapPin className="h-4 w-4" />
                  <span className="font-medium">Arrastra el marcador rojo en el mapa</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="space-y-1">
                    <Label htmlFor="lat" className="text-xs text-gray-600">Latitud</Label>
                    <Input
                      id="lat"
                      type="number"
                      step="any"
                      value={formData.lat}
                      onChange={(e) => {
                        setFormData({ ...formData, lat: e.target.value });
                        const lat = parseFloat(e.target.value);
                        const lng = parseFloat(formData.lng);
                        if (!isNaN(lat) && !isNaN(lng)) {
                          setDraggableMarker({ lat, lng });
                        }
                      }}
                      className="text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lng" className="text-xs text-gray-600">Longitud</Label>
                    <Input
                      id="lng"
                      type="number"
                      step="any"
                      value={formData.lng}
                      onChange={(e) => {
                        setFormData({ ...formData, lng: e.target.value });
                        const lat = parseFloat(formData.lat);
                        const lng = parseFloat(e.target.value);
                        if (!isNaN(lat) && !isNaN(lng)) {
                          setDraggableMarker({ lat, lng });
                        }
                      }}
                      className="text-sm"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDrawer}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {editingLocation ? 'Actualizar' : 'Guardar'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
