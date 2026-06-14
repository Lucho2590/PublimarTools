"use client";

import { useMemo, useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, orderBy, query } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye } from "lucide-react";
import collections from "@/lib/collections";
import {
  EWhatsappConversationStatus,
  TWhatsappConversation,
} from "@/types/whatsapp";

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  [EWhatsappConversationStatus.ACTIVE]: { label: "Activa", className: "bg-green-100 text-green-800" },
  [EWhatsappConversationStatus.HANDOFF]: { label: "Requiere humano", className: "bg-red-100 text-red-800" },
  [EWhatsappConversationStatus.CLOSED]: { label: "Cerrada", className: "bg-slate-100 text-slate-700" },
};

export default function WhatsappConversacionesPage() {
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<TWhatsappConversation | null>(null);

  const convQuery = useMemo(
    () => query(collection(firestore, collections.WHATSAPP_CONVERSATIONS), orderBy("updatedAt", "desc")),
    [firestore]
  );

  const { status, data } = useFirestoreCollectionData(convQuery, { idField: "id" });
  const conversations = (data as TWhatsappConversation[] | undefined) || [];

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return conversations;
    return conversations.filter(
      (c) => c.phone?.includes(q) || c.clientName?.toLowerCase().includes(q)
    );
  }, [conversations, searchTerm]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Conversaciones de WhatsApp</h1>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <Input
            placeholder="Buscar por teléfono o cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Último mensaje</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Actualizado</TableHead>
                <TableHead className="text-center">Ver</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {status === "loading" ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(6)].map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length > 0 ? (
                filtered.map((c) => {
                  const st = STATUS_LABEL[c.status] || { label: c.status, className: "" };
                  const date = toDate(c.updatedAt);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.clientName || "—"}</TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell className="max-w-xs truncate">{c.lastMessage || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={st.className} variant="secondary">
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {date ? date.toLocaleString("es-UY") : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelected(c)}
                          aria-label="Ver conversación"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No hay conversaciones todavía
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selected?.clientName || selected?.phone}
              {selected?.status === EWhatsappConversationStatus.HANDOFF && (
                <Badge className="ml-2 bg-red-100 text-red-800" variant="secondary">
                  Requiere humano
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selected?.handoffReason && (
            <p className="text-sm text-red-700">Motivo handoff: {selected.handoffReason}</p>
          )}
          <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
            {(selected?.messages || []).map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                  m.role === "user"
                    ? "bg-slate-100 text-slate-900 mr-auto"
                    : m.role === "assistant"
                    ? "bg-blue-900 text-white ml-auto"
                    : "bg-amber-50 text-amber-900 mx-auto italic"
                }`}
              >
                {m.content}
              </div>
            ))}
            {(selected?.messages?.length ?? 0) === 0 && (
              <p className="text-center text-slate-500 text-sm py-4">Sin mensajes</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
