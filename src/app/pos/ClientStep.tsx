"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, UserPlus, UserX, Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CuitInput } from "@/components/cuit-input";
import { TClient, EClientSection } from "@/types/client";
import { PosClient } from "./types";

interface ClientStepProps {
  clients: TClient[];
  loading: boolean;
  createClient: (
    data: Omit<TClient, "id" | "createdAt" | "updatedAt">,
  ) => Promise<string>;
  selected: PosClient | null;
  onChange: (client: PosClient | null) => void;
}

const normalize = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function ClientStep({
  clients,
  loading,
  createClient,
  selected,
  onChange,
}: ClientStepProps) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    cuit: "",
  });

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return clients
      .filter((c) => {
        if (!q) return true;
        return (
          normalize(c.name || "").includes(q) ||
          normalize(c.email || "").includes(q) ||
          (c.phone || "").includes(search) ||
          (c.cuit || "").includes(search)
        );
      })
      .slice(0, 50);
  }, [clients, search]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre del cliente es requerido");
      return;
    }
    setSaving(true);
    try {
      const clientData = {
        name: form.name.trim(),
        type: "individual",
        status: "active",
        section: EClientSection.BANDERAS,
        cuit: form.cuit || "",
        address: form.address || "",
        email: form.email || "",
        phone: form.phone || "",
        contacts:
          form.email || form.phone
            ? [{ name: form.name.trim(), email: form.email || "", phone: form.phone || "" }]
            : [],
      } as unknown as Omit<TClient, "id" | "createdAt" | "updatedAt">;

      const id = await createClient(clientData);
      onChange({
        id,
        name: form.name.trim(),
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        cuit: form.cuit || undefined,
      });
      toast.success("Cliente creado");
      setCreating(false);
      setForm({ name: "", email: "", phone: "", address: "", cuit: "" });
    } catch (err) {
      console.error(err);
      toast.error("Error al crear el cliente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Cliente</h2>
      <p className="text-sm text-gray-500 mb-4">
        Elegí un cliente, creá uno nuevo o vendé sin cliente.
      </p>

      {/* Acciones rápidas */}
      <div className="flex gap-2 mb-4">
        <Button
          type="button"
          variant={selected?.id === null ? "default" : "outline"}
          onClick={() =>
            onChange(selected?.id === null ? null : { id: null, name: "" })
          }
        >
          <UserX className="w-4 h-4 mr-1" /> Vender sin cliente
        </Button>
        <Button
          type="button"
          variant={creating ? "default" : "outline"}
          onClick={() => setCreating((v) => !v)}
        >
          <UserPlus className="w-4 h-4 mr-1" /> Crear cliente nuevo
        </Button>
      </div>

      {creating && (
        <div className="rounded-lg border bg-white p-4 mb-4 space-y-3">
          <div>
            <Label>Nombre *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre del cliente"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div>
              <Label>CUIT</Label>
              <CuitInput
                value={form.cuit}
                onValueChange={(digits) => setForm({ ...form, cuit: digits })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreating(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Guardar y usar
            </Button>
          </div>
        </div>
      )}

      {/* Buscador + lista */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email, teléfono o CUIT…"
          className="pl-9"
        />
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border bg-white divide-y">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            No se encontraron clientes
          </div>
        ) : (
          filtered.map((c) => {
            const isSelected = selected?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  onChange({
                    id: c.id,
                    name: c.name,
                    email: c.email,
                    phone: c.phone,
                    address: c.address,
                    cuit: c.cuit,
                    contactName: c.contacts?.[0]?.name,
                  })
                }
                className={`w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 ${
                  isSelected ? "bg-blue-50" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">
                    {c.name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {[c.email, c.phone, c.cuit].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {isSelected && (
                  <Check className="w-4 h-4 text-blue-600 shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
