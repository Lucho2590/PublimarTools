"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PERMANENT_TOKEN_STEPS } from "./content";
import { useWhatsappAdminApi } from "./useWhatsappSetup";

/**
 * Cambia el token del número conectado por uno permanente de usuario del
 * sistema. Mantiene la coexistencia: el número no se toca.
 */
export function TokenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const api = useWhatsappAdminApi();
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ permanent: boolean; expiresAt: string | null } | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      const data = await api<{ permanent: boolean; expiresAt: string | null }>("token", { body: { token } });
      setResult(data);
      setToken("");
      toast.success("Token actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el token");
    } finally {
      setSaving(false);
    }
  };

  const close = (o: boolean) => {
    if (saving) return;
    if (!o) setResult(null);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Hacer permanente el permiso de Meta
          </DialogTitle>
          <DialogDescription>
            El permiso que da la conexión vence a los 60 días. Lo cambiamos por uno que no vence. El número, el celular
            y la coexistencia no se tocan.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 text-sm">
            <div className="flex gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {result.permanent
                  ? "Listo: el permiso ya no vence."
                  : result.expiresAt
                    ? `Guardado, pero este token vence el ${new Date(result.expiresAt).toLocaleDateString("es-AR")}. Si querés que no venza, generalo con caducidad "Nunca".`
                    : "Guardado. No pudimos confirmar con Meta si vence."}
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => close(false)}>Cerrar</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ol className="space-y-2">
              {PERMANENT_TOKEN_STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3 rounded-lg border bg-white p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <div className="text-sm">
                    <p className="font-medium">{s.title}</p>
                    <p className="text-slate-600">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="space-y-1">
              <Label>Token del usuario del sistema</Label>
              <Input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="EAA…"
              />
              <p className="text-xs text-slate-500">Se valida con Meta y se guarda cifrado. No se vuelve a mostrar.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={saving || !token.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar token
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
