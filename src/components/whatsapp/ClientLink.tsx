"use client";

// Muestra con qué cliente de la app está vinculada una conversación de WhatsApp
// y deja vincularla con otro (sugerencias por teléfono primero). Si el cliente
// actual lo creó el bot, al vincular se une con el elegido.

import { useMemo, useState } from "react";
import { useFirestore, useFirestoreDocData, useUser } from "reactfire";
import { doc } from "firebase/firestore";
import { Link2, Search, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import collections from "@/lib/collections";
import { cn } from "@/lib/utils";
import { formatPhone, phoneMatchKey } from "@/lib/phone";
import { useClients } from "@/hooks/useClients";
import { EClientSection } from "@/types/client";
import { linkWhatsappToClient } from "@/lib/whatsapp/clientLink";

function clientPhones(c: any): string[] {
  return [c.phone, ...((c.contacts || []) as any[]).map((x) => x?.phone)].filter(Boolean);
}

export function ClientLink({
  waId,
  fallbackClientId,
  className,
}: {
  /** wa_id de la conversación ("5492235053759"). */
  waId: string;
  /** Cliente que figura en la sesión / pedido, si el contacto todavía no tiene vínculo. */
  fallbackClientId?: string | null;
  className?: string;
}) {
  const firestore = useFirestore();
  const { data: user } = useUser();
  const { data: contact } = useFirestoreDocData(doc(firestore, collections.WHATSAPP_CONTACTS, waId));
  const { clients } = useClients({ section: EClientSection.BANDERAS });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const currentId: string | null = (contact as any)?.clientId || fallbackClientId || null;
  const current = (clients as any[] | undefined)?.find((c) => c.id === currentId) || null;
  const fromBot = current?.source === "whatsapp_bot";
  const linkedBy: string | undefined = (contact as any)?.clientLinkedBy;

  // Sugerencias: los candidatos que dejó el bot + los que tienen el mismo teléfono.
  const suggestions = useMemo(() => {
    const key = phoneMatchKey(waId);
    const candidates = new Set<string>(((contact as any)?.clientCandidates as string[]) || []);
    return ((clients as any[]) || []).filter(
      (c) =>
        c.id !== currentId &&
        c.source !== "whatsapp_bot" &&
        (candidates.has(c.id) || (key && clientPhones(c).some((p) => phoneMatchKey(p) === key)))
    );
  }, [clients, contact, currentId, waId]);

  const results = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (q.length < 2) return [];
    const digits = q.replace(/\D/g, "");
    return ((clients as any[]) || [])
      .filter(
        (c) =>
          c.id !== currentId &&
          c.source !== "whatsapp_bot" &&
          (String(c.name || "").toLowerCase().includes(q) ||
            (digits.length >= 4 && (String(c.cuit || "").replace(/\D/g, "").includes(digits) ||
              clientPhones(c).some((p) => String(p).replace(/\D/g, "").includes(digits)))))
      )
      .slice(0, 20);
  }, [clients, search, currentId]);

  const link = async (clientId: string, name: string) => {
    setSaving(clientId);
    try {
      const r = await linkWhatsappToClient(firestore, { waId, clientId, previousClientId: currentId, uid: user?.uid });
      toast.success(
        `Vinculado con ${name}${r.mergedDuplicate ? " · se unió el cliente que había creado el bot" : ""}${r.moved ? ` · ${r.moved} pedido(s) pasados` : ""}`
      );
      setOpen(false);
      setSearch("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo vincular");
    } finally {
      setSaving(null);
    }
  };

  const needsAction = !current || fromBot;
  const Row = ({ c, badge }: { c: any; badge?: string }) => (
    <button
      type="button"
      disabled={!!saving}
      onClick={() => link(c.id, c.name)}
      className="w-full text-left flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-slate-50 disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium truncate">{c.name}</span>
        <span className="block text-xs text-slate-500 truncate">
          {[clientPhones(c).map((p) => formatPhone(p) || p)[0], c.cuit].filter(Boolean).join(" · ") || "Sin teléfono"}
        </span>
      </span>
      <span className="text-xs text-blue-700 shrink-0">{saving === c.id ? "Vinculando…" : badge || "Vincular"}</span>
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
          needsAction ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700",
          className
        )}
        title="Cliente de la app vinculado a esta conversación"
      >
        {needsAction ? <UserPlus className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
        {current ? current.name : "Sin cliente"}
        {needsAction && <span className="font-medium">· {suggestions.length ? `${suggestions.length} posible(s)` : "vincular"}</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Vincular con un cliente
            </DialogTitle>
            <DialogDescription>
              {current
                ? fromBot
                  ? `Ahora está con "${current.name}", que lo creó el agente. Elegí el cliente que ya tenés cargado: se unen y sus pedidos pasan al elegido.`
                  : `Vinculado con "${current.name}"${linkedBy === "auto" ? " (por teléfono)" : ""}. Podés cambiarlo.`
                : "Elegí el cliente de la app que corresponde a este número."}
            </DialogDescription>
          </DialogHeader>

          {suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500">Mismo teléfono</p>
              {suggestions.map((c) => (
                <Row key={c.id} c={c} badge="Es este" />
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="pl-8"
                placeholder="Buscar por nombre, CUIT o teléfono…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus={!suggestions.length}
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {results.map((c) => (
                <Row key={c.id} c={c} />
              ))}
              {search.trim().length >= 2 && results.length === 0 && (
                <p className="text-sm text-slate-500 p-2">No encontré clientes con eso.</p>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Así el agente sabe quién es y, más adelante, puede responderle por sus pedidos anteriores.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
