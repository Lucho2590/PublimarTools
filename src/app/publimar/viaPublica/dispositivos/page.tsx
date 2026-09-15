"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Edit,
  FileText,
  Grid3x3,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { useDeviceTypes } from "@/hooks/useDeviceTypes";
import { useLocations } from "@/hooks/useLocations";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { buildAficheMap, calcularTotalAfiches } from "@/lib/afiches";
import { getPinColor } from "@/lib/pinColors";
import { normalizeText } from "@/lib/searchText";
import { TDeviceType } from "@/types/device";
import { DeviceTypeFormModal } from "./modal/DeviceTypeFormModal";

export default function DispositivosPage() {
  const { deviceTypes, loading, softDeleteDeviceType } = useDeviceTypes();
  const { locations } = useLocations();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TDeviceType | null>(null);

  // Cuántas ubicaciones y cuántas unidades usa cada tipo: alimenta los KPIs y
  // avisa antes de borrar un tipo que está en uso.
  const usageByType = useMemo(() => {
    const usage = new Map<string, { locations: number; units: number }>();
    locations.forEach((location) => {
      location.devices?.forEach((device) => {
        const prev = usage.get(device.deviceTypeId) ?? { locations: 0, units: 0 };
        usage.set(device.deviceTypeId, {
          locations: prev.locations + 1,
          units: prev.units + (Number(device.quantity) || 0),
        });
      });
    });
    return usage;
  }, [locations]);

  const stats = useMemo(() => {
    const aficheByType = buildAficheMap(deviceTypes);
    return {
      total: deviceTypes.length,
      locationsWithDevices: locations.filter((l) => (l.devices?.length ?? 0) > 0).length,
      totalLocations: locations.length,
      totalAfiches: locations.reduce(
        (sum, l) => sum + calcularTotalAfiches(l.devices, aficheByType),
        0,
      ),
      unused: deviceTypes.filter((dt) => !usageByType.get(dt.id)?.locations).length,
    };
  }, [deviceTypes, locations, usageByType]);

  const filteredDeviceTypes = useMemo(() => {
    const term = normalizeText(debouncedSearch.trim());
    if (!term) return deviceTypes;
    return deviceTypes.filter(
      (dt) =>
        normalizeText(dt.name).includes(term) || normalizeText(dt.description).includes(term),
    );
  }, [deviceTypes, debouncedSearch]);

  const handleNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const handleEdit = (deviceType: TDeviceType) => {
    setEditing(deviceType);
    setModalOpen(true);
  };

  const handleDelete = async (deviceType: TDeviceType) => {
    const used = usageByType.get(deviceType.id)?.locations ?? 0;
    const message = used
      ? `"${deviceType.name}" está usado en ${used} ${used === 1 ? "ubicación" : "ubicaciones"}. ¿Eliminarlo igual?`
      : `¿Seguro que querés eliminar "${deviceType.name}"?`;
    if (!confirm(message)) return;

    try {
      await softDeleteDeviceType(deviceType.id);
      toast.success("Tipo de dispositivo eliminado");
    } catch (error) {
      console.error("Error al eliminar el tipo de dispositivo:", error);
      toast.error("Error al eliminar el tipo de dispositivo");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tipos de Dispositivos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Definí los dispositivos que se instalan en las ubicaciones y el color de su pin
            en el mapa
          </p>
        </div>
        <Button onClick={handleNew} className="bg-blue-900 hover:bg-blue-800">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo tipo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Tipos de dispositivo"
          value={stats.total}
          icon={Grid3x3}
          variant="blue"
        />
        <SummaryCard
          title="Ubicaciones con dispositivos"
          value={stats.locationsWithDevices}
          subtitle={`de ${stats.totalLocations} ubicaciones`}
          icon={MapPin}
          variant="green"
        />
        <SummaryCard
          title="Afiches instalados"
          value={stats.totalAfiches}
          icon={FileText}
          variant="slate"
        />
        <SummaryCard
          title="Tipos sin uso"
          value={stats.unused}
          subtitle="no están en ninguna ubicación"
          icon={AlertTriangle}
          variant="amber"
        />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre o descripción..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground whitespace-nowrap">
              <span className="font-semibold text-blue-900">{filteredDeviceTypes.length}</span>{" "}
              de {deviceTypes.length} tipos
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Listado de tipos</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : filteredDeviceTypes.length === 0 ? (
            <div className="text-center py-12">
              <Grid3x3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              {deviceTypes.length === 0 ? (
                <>
                  <p className="text-gray-500">No hay tipos de dispositivo cargados</p>
                  <Button onClick={handleNew} variant="outline" className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Crear el primero
                  </Button>
                </>
              ) : (
                <p className="text-gray-500">Ningún tipo coincide con la búsqueda</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredDeviceTypes.map((deviceType) => {
                const usage = usageByType.get(deviceType.id);
                const color = getPinColor(deviceType.pinColor);
                return (
                  <div
                    key={deviceType.id}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors duration-150 group"
                  >
                    <button
                      type="button"
                      onClick={() => handleEdit(deviceType)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <span
                        className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: color.hex }}
                        title={`Color del pin: ${color.label}`}
                      >
                        <Grid3x3 className="h-4 w-4 text-white" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{deviceType.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {deviceType.description || "Sin descripción"}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap bg-slate-100 text-slate-700">
                        {deviceType.afiche || 0} afiches/u
                      </span>
                      {usage?.locations ? (
                        <span
                          className="px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap bg-blue-50 text-blue-800"
                          title={`${usage.units} ${usage.units === 1 ? "unidad instalada" : "unidades instaladas"}`}
                        >
                          {usage.locations}{" "}
                          {usage.locations === 1 ? "ubicación" : "ubicaciones"}
                          <span className="text-blue-500"> · {usage.units} u.</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap bg-slate-50 text-slate-400 border border-dashed border-slate-200">
                          Sin uso
                        </span>
                      )}
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar"
                        onClick={() => handleEdit(deviceType)}
                        className="hover:bg-blue-50"
                      >
                        <Edit className="h-4 w-4 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Eliminar"
                        onClick={() => handleDelete(deviceType)}
                        className="hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <DeviceTypeFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        deviceType={editing}
      />
    </div>
  );
}
