import { TEvent } from "@/types/event";
import { getAuth } from "firebase/auth";

// Tipo de operación que se realiza en el evento
export type EventOperation = "create" | "update" | "delete";

// Estructura del payload que se envía a n8n
interface N8nEventPayload {
  operation: EventOperation;
  event: {
    id: string;
    title: string;
    description?: string;
    date: string; // ISO string
    createdBy: string;
    createdByName?: string;
  };
}

/**
 * Envía un evento a n8n para sincronizar con Google Calendar
 * @param operation - Tipo de operación (create, update, delete)
 * @param event - Datos del evento
 * @returns Promise<boolean> - true si se envió correctamente
 */
export async function sendEventToN8n(
  operation: EventOperation,
  event: TEvent | { id: string; title: string; date: Date; createdBy: string; description?: string; createdByName?: string }
): Promise<boolean> {
  try {
    // URL del webhook de n8n (debe configurarse en .env.local)
    const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;

    if (!webhookUrl) {
      console.warn("N8N_WEBHOOK_URL no configurada. Saltando sincronización con Google Calendar.");
      return false;
    }

    // Obtener el token de autenticación del usuario actual
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.warn("Usuario no autenticado. No se puede sincronizar con Google Calendar.");
      return false;
    }

    // Obtener el ID token de Firebase (este token se puede validar en n8n)
    const idToken = await currentUser.getIdToken();

    // Convertir la fecha a ISO string para enviar
    const eventDate = event.date instanceof Date
      ? event.date.toISOString()
      : event.date?.toDate
        ? event.date.toDate().toISOString()
        : new Date().toISOString();

    const payload: N8nEventPayload = {
      operation,
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        date: eventDate,
        createdBy: event.createdBy,
        createdByName: event.createdByName,
      },
    };

    // Enviar a n8n con el token en el header
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`, // Token de Firebase para autenticación
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error("Error al enviar evento a n8n:", response.statusText);
      return false;
    }

    console.log(`✅ Evento ${operation} sincronizado con n8n:`, event.title);
    return true;
  } catch (error) {
    console.error("Error al enviar evento a n8n:", error);
    return false;
  }
}
