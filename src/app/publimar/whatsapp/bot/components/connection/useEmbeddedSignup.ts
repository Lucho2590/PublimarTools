"use client";

// Embedded Signup de Meta (popup "Conectar con Facebook") en modo coexistencia:
// el número sigue en la app WhatsApp Business del celular. Junta las dos cosas
// que manda Meta: el `code` (callback de FB.login) y los datos de la cuenta
// (mensaje `WA_EMBEDDED_SIGNUP` por postMessage), que llegan en cualquier orden.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COEXISTENCE_FEATURE_TYPE,
  COEXISTENCE_SESSION_INFO_VERSION,
} from "@/lib/whatsapp/constants";

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

export type TSignupResult = {
  code: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  businessAppOnboarding: boolean;
};

export class SignupError extends Error {
  constructor(message: string, public readonly kind: "cancel" | "error" | "popup" | "sdk") {
    super(message);
  }
}

const SDK_ID = "facebook-jssdk";
/** Después del code, cuánto esperamos los datos de la cuenta. */
const SESSION_INFO_WAIT_MS = 3000;

export function useEmbeddedSignup(appId: string | null, graphVersion: string) {
  const [sdkReady, setSdkReady] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!appId) return;
    const init = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      setSdkReady(true);
    };
    if (window.FB) {
      init();
      return;
    }
    window.fbAsyncInit = init;
    if (!document.getElementById(SDK_ID)) {
      const script = document.createElement("script");
      script.id = SDK_ID;
      script.src = "https://connect.facebook.net/es_LA/sdk.js";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      document.body.appendChild(script);
    }
  }, [appId, graphVersion]);

  useEffect(() => () => cleanupRef.current?.(), []);

  /**
   * Abre el popup de Meta. Llamarlo DIRECTO desde el click (sin await antes),
   * o el navegador bloquea la ventana.
   */
  const launch = useCallback(
    (configId: string): Promise<TSignupResult> =>
      new Promise((resolve, reject) => {
        if (!window.FB || !sdkReady) {
          reject(new SignupError("Todavía se está cargando Meta. Esperá unos segundos y probá de nuevo.", "sdk"));
          return;
        }
        cleanupRef.current?.();

        let code: string | null = null;
        let session: { event: string; data: any } | null = null;
        let settled = false;
        let waitTimer: ReturnType<typeof setTimeout> | null = null;

        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          cleanup();
          fn();
        };

        const tryResolve = () => {
          if (!code || !session) return;
          const wabaId = session.data?.waba_id;
          finish(() =>
            resolve({
              code: code!,
              // Sin waba_id el servidor lo averigua con el permiso.
              wabaId: wabaId ? String(wabaId) : null,
              phoneNumberId: session!.data?.phone_number_id ? String(session!.data.phone_number_id) : null,
              businessAppOnboarding: session!.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
            })
          );
        };

        const onMessage = (event: MessageEvent) => {
          if (typeof event.origin !== "string" || !event.origin.endsWith("facebook.com")) return;
          let data: any;
          try {
            data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          } catch {
            return;
          }
          if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
          if (data.event === "CANCEL") {
            const step = data.data?.current_step;
            finish(() =>
              reject(
                new SignupError(
                  step ? `Cerraste la ventana de Meta antes de terminar (paso: ${step}).` : "Cerraste la ventana de Meta antes de terminar.",
                  "cancel"
                )
              )
            );
            return;
          }
          if (data.event === "ERROR") {
            finish(() =>
              reject(new SignupError(data.data?.error_message || "Meta mostró un error durante el proceso.", "error"))
            );
            return;
          }
          if (typeof data.event === "string" && data.event.startsWith("FINISH")) {
            session = { event: data.event, data: data.data || {} };
            tryResolve();
          }
        };

        function cleanup() {
          window.removeEventListener("message", onMessage);
          if (waitTimer) clearTimeout(waitTimer);
          cleanupRef.current = null;
        }
        cleanupRef.current = () => {
          settled = true;
          cleanup();
        };

        window.addEventListener("message", onMessage);

        try {
          // El callback de FB.login no puede ser async (el SDK lo rechaza).
          window.FB.login(
            (response: any) => {
              const c = response?.authResponse?.code;
              if (!c) {
                // Sin code: cerró la ventana. Si Meta ya mandó CANCEL/ERROR, ese mensaje gana.
                setTimeout(
                  () => finish(() => reject(new SignupError("Cerraste la ventana de Meta antes de terminar.", "cancel"))),
                  500
                );
                return;
              }
              code = c;
              tryResolve();
              if (!settled) {
                // Meta a veces no manda los datos de la sesión (por ejemplo si
                // se reutilizó una configuración anterior): el servidor
                // averigua la cuenta con el permiso.
                waitTimer = setTimeout(
                  () =>
                    finish(() =>
                      resolve({ code: code!, wabaId: null, phoneNumberId: null, businessAppOnboarding: false })
                    ),
                  SESSION_INFO_WAIT_MS
                );
              }
            },
            {
              config_id: configId,
              response_type: "code",
              override_default_response_type: true,
              extras: {
                setup: {},
                featureType: COEXISTENCE_FEATURE_TYPE,
                sessionInfoVersion: COEXISTENCE_SESSION_INFO_VERSION,
              },
            }
          );
        } catch {
          finish(() =>
            reject(new SignupError("El navegador bloqueó la ventana de Meta. Permití las ventanas emergentes y probá de nuevo.", "popup"))
          );
        }
      }),
    [sdkReady]
  );

  return { sdkReady, launch };
}
