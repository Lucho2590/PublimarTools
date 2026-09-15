import L from "leaflet";
import { getPinColor } from "@/lib/pinColors";

/**
 * Importa Leaflet a nivel de módulo: solo puede consumirse desde `MapView.tsx`,
 * que se carga con `dynamic(..., { ssr: false })`. Importarlo desde una page
 * rompe el build con "window is not defined".
 */

/**
 * Cache a nivel de módulo: como máximo una entrada por color de la paleta.
 * Además de evitar construir un DivIcon por marcador y por render, mantiene la
 * identidad estable para que react-leaflet no llame `setIcon` en cada update.
 * Compartir la instancia entre marcadores es correcto: `DivIcon.createIcon()`
 * genera un nodo DOM nuevo para cada uno.
 */
const iconCache = new Map<string, L.DivIcon>();

/**
 * Pin estilo Google Maps, parametrizado por color.
 *
 * `highlighted` lo dibuja 1.4x más grande, con halo blanco y un anillo que late,
 * para poder encontrarlo entre decenas de pines iguales.
 */
export function makePinIcon(hex: string, hexDark: string, highlighted = false): L.DivIcon {
  const cacheKey = `${hex}|${hexDark}|${highlighted ? "hl" : "normal"}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  // El SVG mantiene el viewBox 32x43; solo cambia el tamaño de render.
  const scale = highlighted ? 1.4 : 1;
  const width = Math.round(32 * scale);
  const height = Math.round(43 * scale);
  // La punta del pin está en y=40 del viewBox.
  const tipY = Math.round(40 * scale);

  const icon = L.divIcon({
    className: highlighted ? "custom-pin-marker custom-pin-marker--highlight" : "custom-pin-marker",
    html: `
      <div style="position: relative; width: ${width}px; height: ${height}px;">
        ${
          highlighted
            ? `<div class="pin-pulse" style="left:${width / 2}px; top:${tipY}px; background:${hex};"></div>`
            : ""
        }
        <svg width="${width}" height="${height}" viewBox="0 0 32 43" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:relative">
          <!-- Sombra -->
          <ellipse cx="16" cy="40" rx="8" ry="3" fill="rgba(0,0,0,0.2)"/>
          ${
            highlighted
              ? `<!-- Halo blanco para despegarlo del resto -->
          <path d="M16 0C9.373 0 4 5.373 4 12c0 9 12 28 12 28s12-19 12-28c0-6.627-5.373-12-12-12z"
                fill="none" stroke="white" stroke-width="5" stroke-linejoin="round"/>`
              : ""
          }
          <!-- Pin principal -->
          <path d="M16 0C9.373 0 4 5.373 4 12c0 9 12 28 12 28s12-19 12-28c0-6.627-5.373-12-12-12z"
                fill="${hex}"
                stroke="${hexDark}"
                stroke-width="1.5"/>
          <!-- Círculo interior blanco -->
          <circle cx="16" cy="12" r="5" fill="white"/>
          <!-- Punto central -->
          <circle cx="16" cy="12" r="2.5" fill="${hex}"/>
        </svg>
      </div>
    `,
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), tipY],
    popupAnchor: [0, -tipY],
  });

  iconCache.set(cacheKey, icon);
  return icon;
}

/** Pin del color de un tipo de dispositivo. Una key desconocida cae al color por defecto. */
export function pinIconForColorKey(key?: string | null, highlighted = false): L.DivIcon {
  const color = getPinColor(key);
  return makePinIcon(color.hex, color.hexDark, highlighted);
}
