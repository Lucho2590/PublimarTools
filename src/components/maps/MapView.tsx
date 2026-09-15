'use client';

import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TLocation } from '@/types/location';
import { TDeviceType } from '@/types/device';
import { buildAficheMap, calcularTotalAfiches } from '@/lib/afiches';
import { DEFAULT_PIN_COLOR_KEY, getPinColor } from '@/lib/pinColors';
import { pinIconForColorKey } from './pinIcon';
import { Maximize, Pencil } from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

// Fix para los iconos de Leaflet en Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapViewProps {
  locations: TLocation[];
  center?: [number, number];
  zoom?: number;
  onMapClick?: (lat: number, lng: number) => void;
  draggableMarker?: { lat: number; lng: number } | null;
  onDraggableMarkerMove?: (lat: number, lng: number) => void;
  onMapReady?: (getCenter: () => [number, number]) => void;
  deviceTypes?: TDeviceType[];
  onEditLocation?: (location: TLocation) => void;
  /** Ubicación resaltada desde la tabla: pin agrandado, al frente y con el mapa centrado en ella. */
  highlightedLocationId?: string | null;
  /** Click sobre el fondo del mapa (ni un pin, ni el popup, ni un pan). */
  onBackgroundClick?: () => void;
}

function MapClickHandler({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

/**
 * `invalidateSize()` cuando cambia el tamaño del contenedor: colapso del
 * sidebar, wrap de la barra de filtros, resize y zoom del navegador.
 *
 * Leaflet solo escucha `window.resize`, así que el colapso del sidebar le
 * cambiaba el ancho sin que se enterara y dejaba el fondo del contenedor
 * descubierto hasta el próximo resize de ventana.
 */
function InvalidateSizeOnResize() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;

    const observer = new ResizeObserver(() => {
      // rAF: mismo patrón que Map._onResize de Leaflet. Colapsa ráfagas de
      // notificaciones y evita el warning de "ResizeObserver loop".
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ debounceMoveend: true }));
    });

    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);

  return null;
}

/**
 * El evento `click` del mapa es exactamente "el usuario clickeó el fondo":
 * Leaflet no lo emite si el click fue sobre un pin (`bubblingMouseEvents: false`
 * en Marker), ni sobre el popup (`disableClickPropagation`), ni después de un
 * pan (`_findEventTargets` descarta el click si el mapa se arrastró).
 */
function BackgroundClickHandler({ onBackgroundClick }: { onBackgroundClick: () => void }) {
  useMapEvents({ click: onBackgroundClick });
  return null;
}

function MapCenterProvider({ onMapReady }: { onMapReady?: (getCenter: () => [number, number]) => void }) {
  const map = useMapEvents({});
  const initializedRef = useRef(false);

  useEffect(() => {
    if (onMapReady && map && !initializedRef.current) {
      const getCenter = () => {
        const center = map.getCenter();
        return [center.lat, center.lng] as [number, number];
      };
      onMapReady(getCenter);
      initializedRef.current = true;
    }
  }, [map, onMapReady]);

  return null;
}

/**
 * Botón de editar dentro del popup, alineado a la izquierda de la X de cerrar.
 * Se posiciona absoluto contra `.leaflet-popup` (el único ancestro posicionado),
 * en el mismo eje que `.leaflet-popup-close-button`: 24px de ancho, pegado arriba.
 */
function PopupEditButton({ onEdit }: { onEdit: () => void }) {
  const map = useMap();

  return (
    <button
      type="button"
      title="Editar esta ubicación"
      aria-label="Editar esta ubicación"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // Se cierra el popup: al editar aparece el marcador rojo arrastrable y el
        // popup lo taparía.
        map.closePopup();
        onEdit();
      }}
      className="text-slate-500 transition-colors hover:text-blue-700"
      style={{
        position: 'absolute',
        top: 0,
        right: 24,
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Pencil style={{ width: 14, height: 14 }} />
    </button>
  );
}

/**
 * Encuadra el mapa sobre las ubicaciones visibles. Se dibuja como control nativo
 * de Leaflet, apilado debajo del zoom.
 */
function FitBoundsControl({ locations }: { locations: TLocation[] }) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement>(null);

  // Sin esto, el click y el scroll sobre el botón los toma el mapa (pan / zoom).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
  }, []);

  const points = useMemo(
    () =>
      locations
        .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng))
        .map((l) => [l.lat, l.lng] as [number, number]),
    [locations],
  );

  if (points.length === 0) return null;

  const handleFit = (e: React.MouseEvent) => {
    e.preventDefault();
    // maxZoom evita que con una sola ubicación quede pegado al piso.
    map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 16 });
  };

  return (
    <div className="leaflet-top leaflet-left" style={{ top: 70 }}>
      <div ref={containerRef} className="leaflet-control leaflet-bar">
        <a
          href="#"
          role="button"
          title="Centrar el mapa en las ubicaciones visibles"
          aria-label="Centrar el mapa en las ubicaciones visibles"
          onClick={handleFit}
          // Inline: `.leaflet-bar a` tiene más especificidad que la clase .flex
          // de Tailwind y su `display: block` ganaría, descentrando el icono.
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Maximize className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

/**
 * Centra el mapa en la ubicación resaltada y le abre el popup.
 * Vive dentro del MapContainer para poder usar `useMap()`.
 */
function HighlightFocus({
  locationId,
  lat,
  lng,
  markerRefs,
}: {
  locationId: string | null;
  lat: number;
  lng: number;
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();

  // Dependencias primitivas a propósito: si dependiera del objeto TLocation, cada
  // snapshot de Firestore lo recrearía y el mapa volvería a volar sin que el
  // usuario haya tocado nada.
  useEffect(() => {
    if (!locationId || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    // No alejamos si el usuario ya estaba más cerca.
    map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { duration: 0.8 });

    // El popup se abre al terminar el vuelo: si no, Leaflet lo reposiciona a mitad de camino.
    const openPopup = () => markerRefs.current.get(locationId)?.openPopup();
    map.once('moveend', openPopup);

    return () => {
      map.off('moveend', openPopup);
      // Al soltar el resaltado (o al pasar a otra ubicación) cerramos el popup
      // que abrimos nosotros. Solo tocamos el marcador de ESTA ubicación: si el
      // usuario abrió a mano el popup de otro pin, ese no es asunto nuestro.
      const marker = markerRefs.current.get(locationId);
      if (marker?.isPopupOpen()) marker.closePopup();
    };
  }, [locationId, lat, lng, map, markerRefs]);

  return null;
}

function DraggableMarker({
  position,
  onDragEnd
}: {
  position: [number, number];
  onDragEnd: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  const [localPosition, setLocalPosition] = useState(position);

  // Actualizar posicion local cuando cambia la prop desde afuera
  useEffect(() => {
    setLocalPosition(position);
  }, [position]);

  const eventHandlers = useMemo(
    () => ({
      drag() {
        const marker = markerRef.current;
        if (marker != null) {
          const pos = marker.getLatLng();
          setLocalPosition([pos.lat, pos.lng]);
        }
      },
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const pos = marker.getLatLng();
          onDragEnd(pos.lat, pos.lng);
        }
      },
    }),
    [onDragEnd],
  );

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={localPosition}
      ref={markerRef}
      icon={pinIconForColorKey('red')}
    >
      <Popup>
        <div className="p-2">
          <p className="text-sm font-medium text-red-600">Nueva Ubicacion</p>
          <p className="text-xs text-gray-500 mt-1">Arrastra el marcador para ajustar la posicion</p>
        </div>
      </Popup>
    </Marker>
  );
}

export default function MapView({
  locations,
  center = [-34.6037, -58.3816], // Buenos Aires por defecto
  zoom = 12,
  onMapClick,
  draggableMarker,
  onDraggableMarkerMove,
  onMapReady,
  deviceTypes = [],
  onEditLocation,
  highlightedLocationId,
  onBackgroundClick
}: MapViewProps) {
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  const highlightedLocation = useMemo(
    () => locations.find((l) => l.id === highlightedLocationId),
    [locations, highlightedLocationId],
  );
  const aficheByType = useMemo(() => buildAficheMap(deviceTypes), [deviceTypes]);

  const colorKeyByDeviceType = useMemo(() => {
    const map = new Map<string, string>();
    deviceTypes.forEach((dt) => map.set(dt.id, dt.pinColor ?? DEFAULT_PIN_COLOR_KEY));
    return map;
  }, [deviceTypes]);

  // El pin toma el color del primer dispositivo cargado en la ubicación.
  const iconForLocation = useCallback(
    (location: TLocation) =>
      pinIconForColorKey(
        colorKeyByDeviceType.get(location.devices?.[0]?.deviceTypeId ?? ''),
        location.id === highlightedLocationId,
      ),
    [colorKeyByDeviceType, highlightedLocationId],
  );


  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
      // Zoom fraccionario: con el snap entero por defecto, fitBounds redondea
      // para abajo y el encuadre queda con mucho margen sobrante.
      zoomSnap={0.25}
      dragging={true}
      touchZoom={true}
      doubleClickZoom={true}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
      {onMapReady && <MapCenterProvider onMapReady={onMapReady} />}

      <InvalidateSizeOnResize />
      {onBackgroundClick && <BackgroundClickHandler onBackgroundClick={onBackgroundClick} />}
      <FitBoundsControl locations={locations} />
      <HighlightFocus
        locationId={highlightedLocation?.id ?? null}
        lat={highlightedLocation?.lat ?? NaN}
        lng={highlightedLocation?.lng ?? NaN}
        markerRefs={markerRefs}
      />

      {/* Marcador draggable para nueva ubicación */}
      {draggableMarker && onDraggableMarkerMove && (
        <DraggableMarker
          position={[draggableMarker.lat, draggableMarker.lng]}
          onDragEnd={onDraggableMarkerMove}
        />
      )}

      {/* Marcadores de ubicaciones existentes */}
      {locations.map((location) => (
        <Marker
          key={location.id}
          position={[location.lat, location.lng]}
          icon={iconForLocation(location)}
          // Los pines se superponen mucho: el resaltado tiene que quedar arriba.
          zIndexOffset={location.id === highlightedLocationId ? 1000 : 0}
          ref={(marker) => {
            if (marker) markerRefs.current.set(location.id, marker);
            else markerRefs.current.delete(location.id);
          }}
        >
          <Popup maxWidth={300} minWidth={250}>
            {onEditLocation && (
              <PopupEditButton onEdit={() => onEditLocation(location)} />
            )}
            <div className="p-2 space-y-3">
              {/* Código de ubicación */}
              <div>
                <h3 className="font-bold text-lg text-blue-900">{location.code}</h3>
              </div>

              {/* Dirección */}
              {location.address && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dirección</p>
                  <p className="text-sm text-gray-700 mt-1">{location.address}</p>
                </div>
              )}

              {/* Fotos - Carousel */}
              {location.photos && location.photos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fotos</p>
                  <Carousel className="w-full">
                    <CarouselContent>
                      {location.photos.map((photoUrl, idx) => (
                        <CarouselItem key={idx}>
                          <div className="relative w-full h-40 rounded-lg overflow-hidden bg-gray-100">
                            <img
                              src={photoUrl}
                              alt={`Foto ${idx + 1} de ${location.code}`}
                              className="w-full h-full object-cover"
                            />
                            {/* Contador de fotos */}
                            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                              {idx + 1} / {location.photos?.length || 0}
                            </div>
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    {location.photos.length > 1 && (
                      <>
                        <CarouselPrevious className="left-2" />
                        <CarouselNext className="right-2" />
                      </>
                    )}
                  </Carousel>
                </div>
              )}

              {/* Dispositivos */}
              {location.devices && location.devices.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dispositivos</p>
                  <ul className="mt-1 space-y-1">
                    {location.devices.map((device, idx) => (
                      <li key={idx} className="text-sm text-gray-700 flex justify-between gap-2">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span
                            aria-hidden
                            className="inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10"
                            style={{
                              backgroundColor: getPinColor(
                                colorKeyByDeviceType.get(device.deviceTypeId),
                              ).hex,
                            }}
                          />
                          <span className="truncate">{device.deviceTypeName}</span>
                        </span>
                        <span className="font-semibold text-blue-900">{device.quantity}</span>
                      </li>
                    ))}
                  </ul>
                  {/* Total de afiches */}
                  {(() => {
                    const totalAfiches = calcularTotalAfiches(location.devices, aficheByType);
                    return totalAfiches > 0 ? (
                      <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between">
                        <span className="text-sm font-semibold text-gray-600">Total Afiches</span>
                        <span className="font-bold text-blue-900">{totalAfiches}</span>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
