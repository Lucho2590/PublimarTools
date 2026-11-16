"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type TSetupStatus = {
  ready: boolean;
  checks: { id: string; ok: boolean; detail?: string; manual?: boolean }[];
  webhook: { callbackUrl: string | null; expectedUrl: string | null; missingFields: string[]; error?: string };
  appId: string | null;
  configId: string | null;
  graphVersion: string;
};

/** Llama a la API de WhatsApp con el ID token del usuario logueado. */
export function useWhatsappAdminApi() {
  const { user } = useAuth();
  return useCallback(
    async <T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
      if (!user) throw new Error("Iniciá sesión de nuevo");
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/whatsapp/admin/${path}`, {
        method: init?.method || (init?.body ? "POST" : "GET"),
        headers: {
          Authorization: `Bearer ${idToken}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init?.body ? JSON.stringify(init.body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Algo falló. Probá de nuevo.");
      return data as T;
    },
    [user]
  );
}

/** Estado de la configuración técnica de Meta (env vars + webhook). */
export function useWhatsappSetup(enabled = true) {
  const api = useWhatsappAdminApi();
  const [status, setStatus] = useState<TSetupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await api<TSetupStatus>("setup-status"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revisar la configuración");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  // La configuración se hace en otra pestaña (Meta, Vercel): al volver a esta,
  // se revisa de nuevo sola para no mostrar un estado viejo.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, refresh]);

  return { status, loading, error, refresh };
}
