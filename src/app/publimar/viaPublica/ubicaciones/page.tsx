"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useFirestore } from "reactfire";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { softDelete } from '@/lib/softDelete';
import { storage } from "@/lib/firebase";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { MapPin, Plus, Trash2, Edit, X, Check, Filter, FileText, Grid3x3, Search, Upload, Image as ImageIcon } from "lucide-react";
import collections from "@/lib/collections";
import { TLocation, TLocationDevice } from "@/types/location";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { PinSwatch } from "@/components/admin/PinColorPicker";
import { useDeviceTypes } from "@/hooks/useDeviceTypes";
import { useLocations } from "@/hooks/useLocations";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { normalizeText } from "@/lib/searchText";
import { TablePagination } from "@/components/admin/TablePagination";
import { DeviceTypeFilter } from "./components/DeviceTypeFilter";
import { buildAficheMap, calcularTotalAfiches } from "@/lib/afiches";
import { useMemo } from "react";

const MapView = dynamic(() => import("@/components/maps/MapView"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-gray-100 rounded-lg flex items-center justify-center">
      <p className="text-gray-500">Cargando mapa...</p>
    </div>
  ),
});

export default function UbicacionesPage() {
  const firestore = useFirestore();
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingLocation, setEditingLocation] = useState<TLocation | null>(
    null
  );
  const [draggableMarker, setDraggableMarker] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    -38.0055, -57.5426,
  ]); // Mar del Plata por defecto
  const [getMapCenter, setGetMapCenter] = useState<
    (() => [number, number]) | null
  >(null);
  const [devices, setDevices] = useState<TLocationDevice[]>([]);
  const [selectedDeviceTypeId, setSelectedDeviceTypeId] = useState<string>("");
  const [deviceQuantity, setDeviceQuantity] = useState<number>(1);

  // Estado para fotos de la ubicación
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Estado para filtros de dispositivos
  const [selectedDeviceTypes, setSelectedDeviceTypes] = useState<Set<string>>(() => {
    // Cargar desde localStorage al inicializar
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mapDeviceFilters');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return new Set(parsed);
        } catch (e) {
          return new Set();
        }
      }
    }
    return new Set(); // Por defecto vacío = muestra todo
  });

  // Ubicación resaltada en el mapa al hacer click en una fila de la tabla
  const [highlightedLocationId, setHighlightedLocationId] = useState<string | null>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);

  // Búsqueda por dirección o código (filtra mapa + KPIs + tabla) y paginación (solo tabla)
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [formData, setFormData] = useState({
    code: "",
    description: "",
    address: "",
    lat: "",
    lng: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    contactNote: "",
  });

  // Obtener ubicacion actual del dispositivo
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setMapCenter([latitude, longitude]);
          toast.success("Ubicacion actual detectada");
        },
        (error) => {
          console.log(
            "No se pudo obtener la ubicacion, usando Mar del Plata por defecto"
          );
          // Ya esta seteado Mar del Plata por defecto
        }
      );
    }
  }, []);

  // Ambos hooks filtran los soft-deleted y devuelven referencias estables, que es
  // lo que permite memoizar todo lo que cuelga de acá (filtros, KPIs, paginación).
  const { locations, loading: locationsLoading } = useLocations();
  const { deviceTypes } = useDeviceTypes();

  const aficheByType = useMemo(() => buildAficheMap(deviceTypes), [deviceTypes]);

  const colorKeyByDeviceType = useMemo(() => {
    const map = new Map<string, string | undefined>();
    deviceTypes.forEach((dt) => map.set(dt.id, dt.pinColor));
    return map;
  }, [deviceTypes]);

  // Guardar filtros en localStorage cuando cambien
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mapDeviceFilters', JSON.stringify(Array.from(selectedDeviceTypes)));
    }
  }, [selectedDeviceTypes]);

  // Por tipo de dispositivo: en cuántas UBICACIONES aparece y cuántas UNIDADES
  // hay instaladas en total. Son dos números distintos y conviene no confundirlos:
  // una ubicación con 6 sextuples cuenta 1 ubicación y 6 unidades.
  const deviceTypeStats = useMemo(() => {
    const stats: Record<string, { locations: number; units: number }> = {};
    deviceTypes.forEach((type) => {
      stats[type.id] = { locations: 0, units: 0 };
    });
    locations.forEach((location) => {
      location.devices?.forEach((device) => {
        const entry = stats[device.deviceTypeId];
        if (!entry) return;
        entry.locations += 1;
        entry.units += Number(device.quantity) || 0;
      });
    });
    return stats;
  }, [locations, deviceTypes]);

  // Filtro único que alimenta el mapa, los KPIs y la tabla
  const filteredLocations = useMemo(() => {
    const term = normalizeText(debouncedSearch.trim());

    let result = locations;

    if (selectedDeviceTypes.size > 0) {
      result = result.filter(location =>
        location.devices?.some(device =>
          selectedDeviceTypes.has(device.deviceTypeId)
        )
      );
    }

    if (term) {
      result = result.filter(
        location =>
          normalizeText(location.address).includes(term) ||
          normalizeText(location.code).includes(term),
      );
    }

    // Copia antes de ordenar: sin filtros `result` es el array del hook, y mutarlo
    // sería mutar una dependencia del useMemo.
    return [...result].sort((a, b) =>
      (a.code ?? "").localeCompare(b.code ?? "", undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [locations, selectedDeviceTypes, debouncedSearch]);

  const searchActive = debouncedSearch.trim().length > 0;
  const activeFilterCount = selectedDeviceTypes.size + (searchActive ? 1 : 0);

  // Paginación: SOLO de la tabla. El mapa y los KPIs siguen usando filteredLocations.
  const totalPages = Math.max(1, Math.ceil(filteredLocations.length / itemsPerPage));
  // Clamp derivado: si un filtro achica la lista estando en la página 7, no queda
  // una tabla vacía ni hace falta un render extra por setState.
  const page = Math.min(currentPage, totalPages);
  const pageItems = useMemo(
    () => filteredLocations.slice((page - 1) * itemsPerPage, page * itemsPerPage),
    [filteredLocations, page, itemsPerPage],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedDeviceTypes, itemsPerPage]);

  // Si la ubicación resaltada deja de pasar los filtros, su pin ya no está en el
  // mapa: soltar el resaltado en vez de dejarlo apuntando a la nada.
  useEffect(() => {
    setHighlightedLocationId((prev) =>
      prev && !filteredLocations.some((l) => l.id === prev) ? null : prev,
    );
  }, [filteredLocations]);

  const clearHighlight = useCallback(() => setHighlightedLocationId(null), []);

  // El resaltado se suelta al clickear en cualquier lado, salvo que el click sea
  // para elegir otra ubicación o para operar el mapa.
  //
  // Fase de CAPTURA y no bubbling: React 18 delega sus handlers en el root
  // container, que es descendiente de document, así que con bubbling este
  // listener correría DESPUÉS del onClick de la fila y apagaría el resaltado
  // que la fila acaba de prender.
  //
  // `click` y no `pointerdown`: pointerdown también dispara cuando el gesto
  // termina siendo un scroll táctil o una selección de texto, y ahí no hubo
  // ninguna intención de soltar nada.
  useEffect(() => {
    if (!highlightedLocationId) return;

    const onDocumentClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      // Adentro del mapa decide Leaflet (ver onBackgroundClick), que sabe
      // distinguir pin, popup, control y pan de un click sobre el fondo.
      if (el?.closest('[data-keep-highlight], .leaflet-container')) return;
      setHighlightedLocationId(null);
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [highlightedLocationId]);

  // Podar filtros de tipos ya eliminados: si no, un tipo borrado deja un filtro
  // fantasma que oculta todas las ubicaciones sin forma obvia de recuperarlas.
  useEffect(() => {
    if (!deviceTypes.length) return; // no podar mientras carga
    setSelectedDeviceTypes((prev) => {
      const valid = new Set(
        Array.from(prev).filter((id) => deviceTypes.some((dt) => dt.id === id))
      );
      return valid.size === prev.size ? prev : valid;
    });
  }, [deviceTypes]);

  // Resumen de lo que se está viendo con los filtros aplicados
  const resumen = useMemo(() => {
    let afiches = 0;
    let dispositivos = 0;
    filteredLocations.forEach((location) => {
      afiches += calcularTotalAfiches(location.devices, aficheByType);
      location.devices?.forEach((d) => {
        dispositivos += Number(d.quantity) || 0;
      });
    });
    return { afiches, dispositivos };
  }, [filteredLocations, aficheByType]);

  // Toggle de tipo de dispositivo
  const toggleDeviceType = (deviceTypeId: string) => {
    setSelectedDeviceTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deviceTypeId)) {
        newSet.delete(deviceTypeId);
      } else {
        newSet.add(deviceTypeId);
      }
      return newSet;
    });
  };

  // Limpiar solo los tipos de dispositivo (chips y popover)
  const clearDeviceFilters = () => {
    setSelectedDeviceTypes(new Set());
  };

  // Limpiar todo, incluida la búsqueda por dirección
  const clearAllFilters = () => {
    setSelectedDeviceTypes(new Set());
    setSearch("");
  };

  // Seleccionar todos los filtros
  const selectAllFilters = () => {
    setSelectedDeviceTypes(new Set(deviceTypes.map(dt => dt.id)));
  };

  const handleNewLocation = () => {
    // Obtener el centro visible actual del mapa
    let initialPosition;
    if (getMapCenter) {
      const currentCenter = getMapCenter();
      initialPosition = { lat: currentCenter[0], lng: currentCenter[1] };
    } else {
      // Fallback al centro inicial
      initialPosition = { lat: mapCenter[0], lng: mapCenter[1] };
    }

    setDraggableMarker(initialPosition);
    setFormData({
      code: "",
      description: "",
      address: "",
      lat: initialPosition.lat.toFixed(6),
      lng: initialPosition.lng.toFixed(6),
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      contactNote: "",
    });
    setDevices([]);
    setPhotos([]);
    setShowDrawer(true);
  };

  const handleDraggableMarkerMove = (lat: number, lng: number) => {
    // Actualizar tanto el marcador como el formulario cuando termina el drag
    setDraggableMarker({ lat, lng });
    setFormData((prev) => ({
      ...prev,
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code || !formData.lat || !formData.lng) {
      toast.error("Codigo y coordenadas son requeridos");
      return;
    }

    try {
      const locationData = {
        code: formData.code,
        description: formData.description,
        address: formData.address,
        lat: parseFloat(formData.lat),
        lng: parseFloat(formData.lng),
        devices: devices,
        photos: photos,
        contactName: formData.contactName,
        contactPhone: formData.contactPhone,
        contactEmail: formData.contactEmail,
        contactNote: formData.contactNote,
        createdAt: new Date(),
      };

      if (editingLocation) {
        await updateDoc(
          doc(
            firestore,
            collections.LOCATIONS || "locations",
            editingLocation.id
          ),
          locationData
        );
        toast.success("Ubicacion actualizada correctamente");
      } else {
        await addDoc(
          collection(firestore, collections.LOCATIONS || "locations"),
          locationData
        );
        toast.success("Ubicacion agregada correctamente");
      }

      handleCloseDrawer();
    } catch (error) {
      console.error("Error al guardar ubicacion:", error);
      toast.error("Error al guardar la ubicacion");
    }
  };

  // Click en una fila: resalta el pin y sube la vista al mapa (el mapa está
  // arriba de la tabla, si no el resaltado quedaría fuera de pantalla).
  const handleHighlight = (location: TLocation) => {
    setHighlightedLocationId(location.id);
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleEdit = (location: TLocation) => {
    setEditingLocation(location);
    setDraggableMarker({ lat: location.lat, lng: location.lng });
    setFormData({
      code: location.code,
      description: location.description || "",
      address: location.address || "",
      lat: location.lat.toString(),
      lng: location.lng.toString(),
      contactName: location.contactName || "",
      contactPhone: location.contactPhone || "",
      contactEmail: location.contactEmail || "",
      contactNote: location.contactNote || "",
    });
    setDevices(location.devices || []);
    setPhotos(location.photos || []);
    setShowDrawer(true);
  };

  const handleDelete = async (locationId: string) => {
    if (!confirm("Estas seguro de eliminar esta ubicacion?")) return;

    try {
      await softDelete(firestore, collections.LOCATIONS || "locations", locationId);
      toast.success("Ubicacion eliminada correctamente");
    } catch (error) {
      console.error("Error al eliminar ubicacion:", error);
      toast.error("Error al eliminar la ubicacion");
    }
  };

  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setEditingLocation(null);
    setDraggableMarker(null);
    setDevices([]);
    setPhotos([]);
    setSelectedDeviceTypeId("");
    setDeviceQuantity(1);
    setFormData({
      code: "",
      description: "",
      address: "",
      lat: "",
      lng: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      contactNote: "",
    });
  };

  const handleAddDevice = () => {
    if (!selectedDeviceTypeId) {
      toast.error("Selecciona un tipo de dispositivo");
      return;
    }

    if (deviceQuantity < 1) {
      toast.error("La cantidad debe ser mayor a 0");
      return;
    }

    const deviceType = deviceTypes.find((dt) => dt.id === selectedDeviceTypeId);
    if (!deviceType) return;

    const newDeviceItem: TLocationDevice = {
      deviceTypeId: selectedDeviceTypeId,
      deviceTypeName: deviceType.name,
      quantity: deviceQuantity,
    };

    setDevices([...devices, newDeviceItem]);
    setSelectedDeviceTypeId("");
    setDeviceQuantity(1);
  };

  const handleDeleteDevice = (index: number) => {
    setDevices(devices.filter((_, i) => i !== index));
  };

  // Manejar subida de foto
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten archivos de imagen");
      return;
    }

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no debe superar los 5MB");
      return;
    }

    try {
      setUploadingPhoto(true);

      // Crear referencia única en Storage
      const timestamp = Date.now();
      const fileName = `${timestamp}_${file.name}`;
      const storageRef = ref(storage, `locations/${fileName}`);

      // Subir archivo
      await uploadBytes(storageRef, file);

      // Obtener URL de descarga
      const downloadURL = await getDownloadURL(storageRef);

      // Agregar URL al array de fotos
      setPhotos([...photos, downloadURL]);

      toast.success("Foto subida correctamente");
    } catch (error) {
      console.error("Error al subir foto:", error);
      toast.error("Error al subir la foto");
    } finally {
      setUploadingPhoto(false);
      // Reset input
      e.target.value = "";
    }
  };

  // Manejar eliminación de foto
  const handlePhotoDelete = async (photoUrl: string, index: number) => {
    if (!confirm("¿Estás seguro de eliminar esta foto?")) return;

    try {
      // Extraer el path del storage desde la URL
      const urlParts = photoUrl.split("/o/")[1];
      if (urlParts) {
        const filePath = decodeURIComponent(urlParts.split("?")[0]);
        const fileRef = ref(storage, filePath);

        // Eliminar del storage
        await deleteObject(fileRef);
      }

      // Eliminar del array de fotos
      setPhotos(photos.filter((_, i) => i !== index));

      toast.success("Foto eliminada correctamente");
    } catch (error) {
      console.error("Error al eliminar foto:", error);
      toast.error("Error al eliminar la foto");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Ubicaciones</h1>
        <Button
          onClick={handleNewLocation}
          className="bg-blue-900 hover:bg-blue-800"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva Ubicacion
        </Button>
      </div>

      {/* Resumen de lo que se está viendo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Ubicaciones visibles"
          value={filteredLocations.length}
          subtitle={`de ${locations.length} totales`}
          icon={MapPin}
          variant="blue"
        />
        <SummaryCard
          title="Afiches visibles"
          value={resumen.afiches}
          subtitle="en las ubicaciones visibles"
          icon={FileText}
          variant="green"
        />
        <SummaryCard
          title="Dispositivos instalados"
          value={resumen.dispositivos}
          subtitle="todos los tipos, en las ubicaciones visibles"
          icon={Grid3x3}
          variant="slate"
        />
        <SummaryCard
          title="Filtros activos"
          value={activeFilterCount || "Todos"}
          subtitle={
            activeFilterCount
              ? "Tocá para limpiar los filtros"
              : `de ${deviceTypes.length} tipos`
          }
          icon={Filter}
          variant="amber"
          onClick={activeFilterCount ? clearAllFilters : undefined}
        />
      </div>

      {/* Filtros por tipo de dispositivo. El punto de color va siempre: los chips
          funcionan como leyenda de los pines del mapa. */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-600 mr-1">
              Filtrar por dispositivo:
            </span>

            {deviceTypes.map((deviceType) => {
              const isSelected = selectedDeviceTypes.has(deviceType.id);
              const stats = deviceTypeStats[deviceType.id] ?? { locations: 0, units: 0 };

              return (
                <button
                  key={deviceType.id}
                  onClick={() => toggleDeviceType(deviceType.id)}
                  title={`${deviceType.name}: en ${stats.locations} ${
                    stats.locations === 1 ? "ubicación" : "ubicaciones"
                  } · ${stats.units} ${
                    stats.units === 1 ? "unidad instalada" : "unidades instaladas"
                  }`}
                  className={`
                    inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium
                    transition-colors duration-150
                    ${
                      isSelected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-900"
                    }
                  `}
                >
                  <PinSwatch colorKey={deviceType.pinColor} className="h-2.5 w-2.5" />
                  <span>{deviceType.name}</span>
                  {/* Dos números distintos: ubicaciones donde aparece y unidades
                      instaladas. Sin las etiquetas se confunden. */}
                  <span
                    className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                      isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {stats.locations} ub
                    <span className={isSelected ? "text-white/60" : "text-slate-400"}>
                      {" · "}
                    </span>
                    {stats.units} u
                  </span>
                  {isSelected && <Check className="h-3 w-3" />}
                </button>
              );
            })}

            <div className="ml-auto flex items-center gap-2">
              {selectedDeviceTypes.size > 0 && (
                <Button variant="ghost" size="sm" onClick={clearDeviceFilters}>
                  Limpiar
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllFilters}
                disabled={selectedDeviceTypes.size === deviceTypes.length}
              >
                Todos
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mapa - Responsive y robusto */}
      {/* Alto fijo en px enteros a propósito: con `calc(100vh - …)` el zoom del
          navegador achica el viewport en px CSS, el mapa cambia de alto y
          reacomoda toda la página; y el alto fraccionario resultante deja
          hilos sub-pixel en el borde. Era el único elemento de la app atado al
          viewport, por eso el síntoma se veía solo acá.
          `overflow-hidden rounded-lg` viven acá y no en el MapContainer: una
          sola caja redondea y recorta. */}
      <div
        ref={mapSectionRef}
        className="w-full relative z-0 overflow-hidden rounded-lg h-[440px] md:h-[520px] xl:h-[600px] 2xl:h-[700px]"
      >
        {locationsLoading ? (
          <div className="h-full w-full bg-gray-100 rounded-lg flex items-center justify-center">
            <p className="text-gray-500">Cargando ubicaciones...</p>
          </div>
        ) : (
          /* La paginación es solo de la tabla: el mapa muestra todo lo filtrado. */
          <MapView
            locations={filteredLocations}
            center={mapCenter}
            draggableMarker={draggableMarker}
            onDraggableMarkerMove={handleDraggableMarkerMove}
            onMapReady={(getCenterFn) => setGetMapCenter(() => getCenterFn)}
            deviceTypes={deviceTypes}
            onEditLocation={handleEdit}
            highlightedLocationId={highlightedLocationId}
            onBackgroundClick={clearHighlight}
          />
        )}
      </div>

      {/* Lista de ubicaciones */}
      <Card>
        <CardHeader>
          <CardTitle>Ubicaciones Registradas ({filteredLocations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {/* La barra va FUERA del estado vacío: si no, una búsqueda sin resultados
              haría desaparecer el input y no habría forma de borrar el término. */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Buscar por dirección o código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <DeviceTypeFilter
              deviceTypes={deviceTypes}
              selected={selectedDeviceTypes}
              onToggle={toggleDeviceType}
              onClear={clearDeviceFilters}
              onSelectAll={selectAllFilters}
              stats={deviceTypeStats}
            />
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                Limpiar filtros
              </Button>
            )}
          </div>

          {filteredLocations.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              {locations.length === 0 ? (
                <>
                  <p className="text-gray-500">No hay ubicaciones registradas</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Agrega tu primera ubicacion haciendo click en Nueva Ubicacion
                  </p>
                </>
              ) : searchActive ? (
                <>
                  <p className="text-gray-500">
                    No se encontraron ubicaciones para &ldquo;{debouncedSearch.trim()}&rdquo;
                  </p>
                  <p className="text-sm text-gray-400 mt-2">
                    Probá con otra dirección o código, o revisá los filtros de dispositivo
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setSearch("")}
                  >
                    Limpiar búsqueda
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-gray-500">No hay ubicaciones con los filtros seleccionados</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Intenta seleccionar otros tipos de dispositivos
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Direccion</TableHead>
                  <TableHead>Dispositivos</TableHead>
                  <TableHead className="text-center">Afiches</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((location) => {
                  const totalAfiches = calcularTotalAfiches(location.devices, aficheByType);
                  return (
                  <TableRow
                    key={location.id}
                    data-keep-highlight
                    onClick={() => handleHighlight(location)}
                    title="Ver esta ubicación en el mapa"
                    className={`cursor-pointer ${
                      location.id === highlightedLocationId
                        ? "bg-blue-50 hover:bg-blue-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <TableCell className="font-medium">
                      {location.code}
                    </TableCell>
                    <TableCell>{location.address || "-"}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {location.devices && location.devices.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {location.devices.map((d, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-xs"
                            >
                              <PinSwatch
                                colorKey={colorKeyByDeviceType.get(d.deviceTypeId)}
                                className="h-2 w-2"
                              />
                              {d.quantity} {d.deviceTypeName}
                            </span>
                          ))}
                        </div>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {totalAfiches > 0 ? (
                        <span className="font-semibold text-blue-900">{totalAfiches}</span>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* stopPropagation: editar/eliminar no deben resaltar la fila */}
                      <div
                        className="flex justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                  );
                })}
              </TableBody>
            </Table>

            <TablePagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filteredLocations.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
            </>
          )}
        </CardContent>
      </Card>

      {/* Drawer lateral derecho */}
      {/* modal={false}: en modo modal Radix pone pointer-events:none en el body y
          atrapa el foco, lo que impide scrollear e interactuar con el resto de la
          página mientras el drawer está abierto. */}
      <Sheet
        modal={false}
        open={showDrawer}
        onOpenChange={(open) => {
          // Solo permitir cerrar el drawer desde el boton X o Cancelar, no al hacer click afuera
          if (!open && showDrawer) {
            return;
          }
          setShowDrawer(open);
        }}
      >
        <SheetContent
          side="right"
          className="w-[400px] sm:w-[540px] overflow-y-auto z-[100]"
          hideOverlay
          onInteractOutside={(e) => {
            // Prevenir que se cierre al hacer click en el mapa
            e.preventDefault();
          }}
        >
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>
                {editingLocation ? "Editar Ubicacion" : "Nueva Ubicacion"}
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
                ? "Modifica los datos de la ubicacion y mueve el marcador rojo en el mapa"
                : "Arrastra el marcador rojo en el mapa para seleccionar la ubicacion"}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="dispositivos">Dispositivos</TabsTrigger>
                <TabsTrigger value="contacto">Contacto</TabsTrigger>
              </TabsList>

              {/* TAB: GENERAL */}
              <TabsContent value="general" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Codigo de Ubicacion *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value })
                    }
                    placeholder="Ej: UB-001"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Direccion</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    placeholder="Ej: Av. Corrientes 1234, CABA"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descripcion</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Detalles adicionales sobre la ubicacion"
                    rows={4}
                  />
                </div>

                {/* Sección de fotos */}
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Fotos de la Ubicación</Label>
                    <label
                      htmlFor="photo-upload"
                      className={`cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        uploadingPhoto
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-blue-900 text-white hover:bg-blue-800"
                      }`}
                    >
                      <Upload className="h-4 w-4" />
                      {uploadingPhoto ? "Subiendo..." : "Subir Foto"}
                    </label>
                    <input
                      id="photo-upload"
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto}
                      className="hidden"
                    />
                  </div>

                  {/* Previsualización de fotos */}
                  {photos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {photos.map((photoUrl, index) => (
                        <div
                          key={index}
                          className="relative group aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-500 transition-colors"
                        >
                          <img
                            src={photoUrl}
                            alt={`Foto ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {/* Overlay con botón eliminar */}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => handlePhotoDelete(photoUrl, index)}
                              className="gap-1"
                            >
                              <Trash2 className="h-4 w-4" />
                              Eliminar
                            </Button>
                          </div>
                          {/* Número de foto */}
                          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                            {index + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 px-4 border-2 border-dashed border-gray-300 rounded-lg">
                      <ImageIcon className="h-12 w-12 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500 text-center">
                        No hay fotos agregadas
                      </p>
                      <p className="text-xs text-gray-400 text-center mt-1">
                        Las fotos se mostrarán en el popup del mapa
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* TAB: DISPOSITIVOS */}
              <TabsContent value="dispositivos" className="space-y-4 mt-4">
                {/* Selector de tipo de dispositivo con botones */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Selecciona un tipo:</Label>
                  <div className="flex flex-wrap gap-2">
                    {deviceTypes.length === 0 ? (
                      <p className="text-sm text-gray-500">No hay tipos de dispositivos creados</p>
                    ) : (
                      deviceTypes.map((type) => (
                        <Button
                          key={type.id}
                          type="button"
                          variant={selectedDeviceTypeId === type.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedDeviceTypeId(type.id)}
                          className={`${
                            selectedDeviceTypeId === type.id
                              ? "bg-blue-900 hover:bg-blue-800"
                              : ""
                          }`}
                        >
                          {selectedDeviceTypeId === type.id && (
                            <Check className="h-3 w-3 mr-1" />
                          )}
                          {type.name}
                        </Button>
                      ))
                    )}
                  </div>
                </div>

                {/* Input de cantidad y botón agregar */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label htmlFor="deviceQuantity" className="text-sm">Cantidad</Label>
                    <Input
                      id="deviceQuantity"
                      type="number"
                      min="1"
                      value={deviceQuantity}
                      onChange={(e) => setDeviceQuantity(parseInt(e.target.value) || 1)}
                      placeholder="Cantidad"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleAddDevice}
                    className="bg-green-600 hover:bg-green-700"
                    disabled={!selectedDeviceTypeId}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar
                  </Button>
                </div>

                {/* Tabla de dispositivos agregados */}
                {devices.length > 0 && (
                  <div className="pt-4 border-t">
                    <Label className="text-sm font-medium mb-2 block">Dispositivos agregados:</Label>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cantidad</TableHead>
                          <TableHead>Dispositivo</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {devices.map((device, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{device.quantity}</TableCell>
                            <TableCell>{device.deviceTypeName}</TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteDevice(index)}
                                className="h-8 w-8 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* TAB: CONTACTO */}
              <TabsContent value="contacto" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Nombre</Label>
                  <Input
                    id="contactName"
                    value={formData.contactName}
                    onChange={(e) =>
                      setFormData({ ...formData, contactName: e.target.value })
                    }
                    placeholder="Nombre del contacto"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Telefono</Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    value={formData.contactPhone}
                    onChange={(e) =>
                      setFormData({ ...formData, contactPhone: e.target.value })
                    }
                    placeholder="Ej: +54 9 223 123-4567"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, contactEmail: e.target.value })
                    }
                    placeholder="email@ejemplo.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactNote">Nota</Label>
                  <Textarea
                    id="contactNote"
                    value={formData.contactNote}
                    onChange={(e) =>
                      setFormData({ ...formData, contactNote: e.target.value })
                    }
                    placeholder="Notas adicionales sobre el contacto"
                    rows={4}
                  />
                </div>
              </TabsContent>
            </Tabs>

            {/* <div className="space-y-4">
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
            </div> */}

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
                {editingLocation ? "Actualizar" : "Guardar"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
