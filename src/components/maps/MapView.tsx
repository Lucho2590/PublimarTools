'use client';

import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';

// Fix para los iconos de Leaflet en Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Crear un icono personalizado rojo usando divIcon
const redIcon = L.divIcon({
  className: 'custom-red-marker',
  html: `<div style="
    width: 25px;
    height: 41px;
    position: relative;
    filter: hue-rotate(120deg) saturate(3);
  ">
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5s12.5-19.125 12.5-28.5C25 5.596 19.404 0 12.5 0z" fill="#dc2626" stroke="#991b1b" stroke-width="1.5"/>
      <circle cx="12.5" cy="12.5" r="6" fill="white"/>
    </svg>
  </div>`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
}

interface MapViewProps {
  locations: Location[];
  center?: [number, number];
  zoom?: number;
  onMapClick?: (lat: number, lng: number) => void;
  draggableMarker?: { lat: number; lng: number } | null;
  onDraggableMarkerMove?: (lat: number, lng: number) => void;
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

function DraggableMarker({
  position,
  onDragEnd
}: {
  position: [number, number];
  onDragEnd: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);

  const eventHandlers = useMemo(
    () => ({
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
      position={position}
      ref={markerRef}
      icon={redIcon}
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
  onDraggableMarkerMove
}: MapViewProps) {
  // Asegurar que el componente solo se renderice en el cliente
  useEffect(() => {
    // Forzar re-render del mapa después del montaje
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }, []);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: '100%', width: '100%', minHeight: '500px' }}
      className="rounded-lg"
      scrollWheelZoom={true}
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

      {/* Marcador draggable para nueva ubicación */}
      {draggableMarker && onDraggableMarkerMove && (
        <DraggableMarker
          position={[draggableMarker.lat, draggableMarker.lng]}
          onDragEnd={onDraggableMarkerMove}
        />
      )}

      {/* Marcadores de ubicaciones existentes */}
      {locations.map((location) => (
        <Marker key={location.id} position={[location.lat, location.lng]}>
          <Popup>
            <div className="p-2">
              <h3 className="font-bold text-lg">{location.name}</h3>
              {location.description && (
                <p className="text-sm text-gray-600 mt-1">{location.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
