"use client";

import { useEffect } from "react";

/**
 * Registra el service worker de la PWA de Punto de Venta.
 * Se monta solo dentro de /pos, así el SW no se registra al navegar el resto
 * de la app. El SW es online-only (no cachea): solo habilita la instalación.
 */
export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("No se pudo registrar el service worker de /pos:", err);
    });
  }, []);

  return null;
}
