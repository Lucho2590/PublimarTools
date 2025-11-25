'use client';

import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TLocation } from '@/types/location';

// Fix para los iconos de Leaflet en Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Pin rojo moderno estilo Google Maps
const redIcon = L.divIcon({
  className: 'custom-red-marker',
  html: `
    <div style="position: relative; width: 32px; height: 43px;">
      <svg width="32" height="43" viewBox="0 0 32 43" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Sombra -->
        <ellipse cx="16" cy="40" rx="8" ry="3" fill="rgba(0,0,0,0.2)"/>
        <!-- Pin principal -->
        <path d="M16 0C9.373 0 4 5.373 4 12c0 9 12 28 12 28s12-19 12-28c0-6.627-5.373-12-12-12z"
              fill="#dc2626"
              stroke="#991b1b"
              stroke-width="1.5"/>
        <!-- Círculo interior blanco -->
        <circle cx="16" cy="12" r="5" fill="white"/>
        <!-- Punto central rojo -->
        <circle cx="16" cy="12" r="2.5" fill="#dc2626"/>
      </svg>
    </div>
  `,
  iconSize: [32, 43],
  iconAnchor: [16, 40],
  popupAnchor: [0, -40],
});

interface MapViewProps {
  locations: TLocation[];
  center?: [number, number];
  zoom?: number;
  onMapClick?: (lat: number, lng: number) => void;
  draggableMarker?: { lat: number; lng: number } | null;
  onDraggableMarkerMove?: (lat: number, lng: number) => void;
  onMapReady?: (getCenter: () => [number, number]) => void;
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
  onDraggableMarkerMove,
  onMapReady
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
      {onMapReady && <MapCenterProvider onMapReady={onMapReady} />}

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
