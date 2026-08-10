"use client";

import { useEffect, useMemo, useState } from "react";
import { useFirestore } from "reactfire";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/phone-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Save, ShieldCheck } from "lucide-react";
import collections from "@/lib/collections";
import { GRANTABLE_MODULES } from "@/lib/grantableModules";
import { EUserRole } from "@/types/user";
import { isAdminOrAbove } from "@/lib/permissions";
import { isValidPhone } from "@/lib/phone";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: EUserRole | null;
  permissions: string[];
  phone: string;
};

const ROLE_LABELS: Record<string, string> = {
  [EUserRole.SUPERUSER]: "Superuser",
  [EUserRole.ADMIN]: "Admin",
  [EUserRole.BANDERAS]: "Banderas",
  [EUserRole.VIA_PUBLICA]: "Vía Pública",
};

export function PermissionsTab() {
  const firestore = useFirestore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Borrador editable: uid -> permisos seleccionados
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  // Borrador editable del celular: uid -> valor E.164 normalizado
  const [phoneDraft, setPhoneDraft] = useState<Record<string, string>>({});

  const loadUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(firestore, collections.USERS));
      const rows: UserRow[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          email: data.email || "",
          displayName: data.displayName || "",
          role: data.role || null,
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          phone: typeof data.phone === "string" ? data.phone : "",
        };
      });
      rows.sort((a, b) =>
        (a.displayName || a.email).localeCompare(b.displayName || b.email)
      );
      setUsers(rows);
      setDraft(
        Object.fromEntries(rows.map((r) => [r.id, new Set(r.permissions)]))
      );
      setPhoneDraft(Object.fromEntries(rows.map((r) => [r.id, r.phone])));
    } catch (error) {
      console.error("Error cargando usuarios:", error);
      toast.error("No se pudieron cargar los usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore]);

  const toggle = (uid: string, href: string, checked: boolean) => {
    setDraft((prev) => {
      const next = new Set(prev[uid] ?? []);
      if (checked) next.add(href);
      else next.delete(href);
      return { ...prev, [uid]: next };
    });
  };

  const isDirty = (user: UserRow): boolean => {
    if ((phoneDraft[user.id] ?? "") !== user.phone) return true;
    const current = draft[user.id] ?? new Set<string>();
    const original = new Set(user.permissions);
    if (current.size !== original.size) return true;
    return Array.from(current).some((p) => !original.has(p));
  };

  const handleSave = async (user: UserRow) => {
    const next = Array.from(draft[user.id] ?? new Set<string>());
    const phone = phoneDraft[user.id] ?? "";
    if (phone && !isValidPhone(phone)) {
      toast.error("Celular inválido");
      return;
    }
    setSavingId(user.id);
    try {
      await updateDoc(doc(firestore, collections.USERS, user.id), {
        permissions: next,
        phone,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, permissions: next, phone } : u
        )
      );
      toast.success(`Datos actualizados para ${user.displayName || user.email}`);
    } catch (error) {
      console.error("Error guardando permisos:", error);
      toast.error("No se pudieron guardar los permisos");
    } finally {
      setSavingId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-900" />
          Permisos por usuario
        </CardTitle>
        <Button onClick={loadUsers} variant="outline" disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Recargar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Habilitá módulos puntuales de Administración a usuarios que normalmente
          no tendrían acceso. Los Admin y Superuser ya ven todo; estos permisos
          solo suman accesos, nunca los quitan.
        </p>

        <Input
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Cargando usuarios…
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay usuarios para mostrar
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Usuario</TableHead>
                  {GRANTABLE_MODULES.map((m) => (
                    <TableHead key={m.key} className="text-center whitespace-nowrap">
                      {m.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const selected = draft[user.id] ?? new Set<string>();
                  const adminOrAbove = isAdminOrAbove(user.role);
                  const dirty = isDirty(user);
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">
                          {user.displayName || "(sin nombre)"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {user.email}
                        </div>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700">
                          {user.role ? ROLE_LABELS[user.role] ?? user.role : "—"}
                        </span>
                        <div className="mt-2">
                          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Celular
                          </label>
                          <PhoneInput
                            value={phoneDraft[user.id] ?? ""}
                            onValueChange={(v) =>
                              setPhoneDraft((p) => ({ ...p, [user.id]: v }))
                            }
                            className="w-[150px]"
                          />
                        </div>
                      </TableCell>
                      {GRANTABLE_MODULES.map((m) => (
                        <TableCell key={m.key} className="text-center">
                          <Checkbox
                            checked={adminOrAbove || selected.has(m.href)}
                            disabled={adminOrAbove}
                            onCheckedChange={(v) =>
                              toggle(user.id, m.href, v === true)
                            }
                            aria-label={`${m.label} para ${user.email}`}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => handleSave(user)}
                          disabled={!dirty || savingId === user.id}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Guardar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
