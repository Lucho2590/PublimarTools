"use client";

import { useMemo, useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, orderBy, query, where } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, MessageSquare, Smartphone } from "lucide-react";
import collections from "@/lib/collections";
import {
  EWhatsappContactStatus,
  EWhatsappMessageDirection,
} from "@/types/whatsapp";

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function initials(name?: string | null, phone?: string | null): string {
  const src = (name || phone || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

type Contact = {
  id: string;
  name?: string | null;
  phoneE164?: string | null;
  unreadCount?: number;
  lastMessagePreview?: string | null;
  lastMessageAt?: any;
  status?: EWhatsappContactStatus;
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  [EWhatsappContactStatus.HANDOFF]: {
    label: "Requiere humano",
    className: "bg-red-100 text-red-800",
  },
  [EWhatsappContactStatus.CLOSED]: {
    label: "Cerrada",
    className: "bg-slate-100 text-slate-700",
  },
};

export default function WhatsappConversacionesPage() {
  const firestore = useFirestore();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);

  const contactsQuery = useMemo(
    () =>
      query(
        collection(firestore, collections.WHATSAPP_CONTACTS),
        orderBy("lastMessageAt", "desc")
      ),
    [firestore]
  );
  const { status, data } = useFirestoreCollectionData(contactsQuery, {
    idField: "id",
  });
  const contacts = (data as Contact[] | undefined) || [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.phoneE164?.includes(q) || c.name?.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Conversaciones de WhatsApp</h1>

      <Card className="overflow-hidden">
        <div className="flex h-[calc(100vh-220px)] min-h-[420px]">
          {/* Lista de contactos */}
          <div
            className={`${
              selected ? "hidden md:flex" : "flex"
            } w-full md:w-80 shrink-0 flex-col border-r`}
          >
            <div className="p-3 border-b">
              <Input
                placeholder="Buscar por teléfono o nombre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="flex-1">
              {status === "loading" ? (
                <div className="p-3 space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No hay conversaciones todavía
                </div>
              ) : (
                filtered.map((c) => {
                  const date = toDate(c.lastMessageAt);
                  const isSel = selected?.id === c.id;
                  const unread = c.unreadCount ?? 0;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelected(c)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 border-b ${
                        isSel ? "bg-slate-100" : ""
                      }`}
                    >
                      <div className="h-10 w-10 shrink-0 rounded-full bg-blue-900 text-white text-xs font-semibold flex items-center justify-center">
                        {initials(c.name, c.phoneE164)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">
                            {c.name || c.phoneE164 || c.id}
                          </span>
                          {date && (
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {date.toLocaleDateString("es-UY", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500 truncate">
                            {c.lastMessagePreview || "—"}
                          </span>
                          {unread > 0 && (
                            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-green-500 text-white text-[10px] font-semibold flex items-center justify-center">
                              {unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </ScrollArea>
          </div>

          {/* Hilo */}
          <div
            className={`${
              selected ? "flex" : "hidden md:flex"
            } flex-1 flex-col min-w-0`}
          >
            {selected ? (
              <ConversationThread
                contact={selected}
                onBack={() => setSelected(null)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                <MessageSquare className="h-10 w-10 mb-2" />
                <p className="text-sm">Elegí una conversación</p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ConversationThread({
  contact,
  onBack,
}: {
  contact: Contact;
  onBack: () => void;
}) {
  const firestore = useFirestore();
  const messagesQuery = useMemo(
    () =>
      query(
        collection(firestore, collections.WHATSAPP_MESSAGES),
        where("contactId", "==", contact.id),
        orderBy("createdAt", "asc")
      ),
    [firestore, contact.id]
  );
  const { status, data } = useFirestoreCollectionData(messagesQuery, {
    idField: "id",
  });
  const messages = (data as any[] | undefined) || [];
  const statusBadge = contact.status ? STATUS_BADGE[contact.status] : undefined;

  return (
    <>
      {/* Encabezado del hilo */}
      <div className="flex items-center gap-3 p-3 border-b">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onBack}
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="h-9 w-9 shrink-0 rounded-full bg-blue-900 text-white text-xs font-semibold flex items-center justify-center">
          {initials(contact.name, contact.phoneE164)}
        </div>
        <div className="min-w-0">
          <div className="font-medium truncate">
            {contact.name || contact.phoneE164 || contact.id}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {contact.phoneE164}
          </div>
        </div>
        {statusBadge && (
          <Badge className={`ml-auto ${statusBadge.className}`} variant="secondary">
            {statusBadge.label}
          </Badge>
        )}
      </div>

      {/* Mensajes */}
      <ScrollArea className="flex-1 bg-slate-50">
        <div className="p-4 space-y-2">
          {status === "loading" ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-8 w-52 ml-auto" />
              <Skeleton className="h-8 w-36" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">Sin mensajes</p>
          ) : (
            messages.map((m) => {
              const outbound = m.direction === EWhatsappMessageDirection.OUTBOUND;
              const isEcho = m?.metadata?.isEcho === true;
              const time = toDate(m.createdAt);
              return (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    outbound
                      ? "bg-blue-900 text-white ml-auto"
                      : "bg-white border text-slate-900 mr-auto"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {m.content || `[${m.type}]`}
                  </div>
                  <div
                    className={`mt-0.5 flex items-center gap-1 text-[10px] ${
                      outbound ? "text-blue-200" : "text-slate-400"
                    }`}
                  >
                    {isEcho && <Smartphone className="h-3 w-3" />}
                    {time && (
                      <span>
                        {time.toLocaleTimeString("es-UY", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Composer (deshabilitado hasta la Fase 4) */}
      <div className="border-t p-3">
        <Input
          disabled
          placeholder="Responder desde la app — disponible en la próxima fase"
        />
      </div>
    </>
  );
}
