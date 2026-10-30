import { redirect } from "next/navigation";

// "Conversaciones" pasó a llamarse "Chat" (conversaciones del bot con filtros).
export default function WhatsappConversacionesPage() {
  redirect("/publimar/whatsapp/chat");
}
