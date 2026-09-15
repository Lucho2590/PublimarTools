"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PinColorPicker, PinSwatch } from "@/components/admin/PinColorPicker";
import { useDeviceTypes } from "@/hooks/useDeviceTypes";
import { DEFAULT_PIN_COLOR_KEY, getPinColor, TPinColorKey } from "@/lib/pinColors";
import { TDeviceType } from "@/types/device";

interface DeviceTypeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceType?: TDeviceType | null;
  onSuccess?: () => void;
}

const EMPTY = {
  name: "",
  description: "",
  // Se guarda como string para que el input numérico pueda quedar vacío.
  afiche: "",
  pinColor: DEFAULT_PIN_COLOR_KEY as TPinColorKey,
};

export function DeviceTypeFormModal({
  open,
  onOpenChange,
  deviceType,
  onSuccess,
}: DeviceTypeFormModalProps) {
  const { createDeviceType, updateDeviceType } = useDeviceTypes();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const isEditing = !!deviceType?.id;

  useEffect(() => {
    if (deviceType) {
      setForm({
        name: deviceType.name ?? "",
        description: deviceType.description ?? "",
        afiche: deviceType.afiche ? String(deviceType.afiche) : "",
        pinColor: deviceType.pinColor ?? DEFAULT_PIN_COLOR_KEY,
      });
    } else {
      setForm(EMPTY);
    }
  }, [deviceType, open]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("El nombre del tipo de dispositivo es requerido");
      return;
    }

    const afiche = form.afiche === "" ? 0 : Number(form.afiche);
    if (!Number.isInteger(afiche) || afiche < 0) {
      toast.error("La cantidad de afiches debe ser un número entero mayor o igual a 0");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        description: form.description.trim(),
        afiche,
        pinColor: form.pinColor,
      };

      if (isEditing && deviceType?.id) {
        await updateDeviceType(deviceType.id, payload);
        toast.success("Tipo de dispositivo actualizado");
      } else {
        await createDeviceType(payload);
        toast.success("Tipo de dispositivo creado");
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error al guardar el tipo de dispositivo:", error);
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const selectedColor = getPinColor(form.pinColor);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar tipo de dispositivo" : "Nuevo tipo de dispositivo"}
          </DialogTitle>
          <DialogDescription>
            El color elegido es el que van a usar en el mapa los pines de las ubicaciones
            que tengan este dispositivo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div>
            <Label htmlFor="deviceName" className="mb-1 block">
              Nombre *
            </Label>
            <Input
              id="deviceName"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Ej: Simple, Doble, Pantalla LED"
            />
          </div>

          <div>
            <Label htmlFor="deviceDescription" className="mb-1 block">
              Descripción
            </Label>
            <Textarea
              id="deviceDescription"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Ej: Cartel publicitario de una cara"
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="deviceAfiche" className="mb-1 block">
              Afiches por unidad
            </Label>
            <Input
              id="deviceAfiche"
              type="number"
              min={0}
              step={1}
              value={form.afiche}
              onChange={(e) => update("afiche", e.target.value)}
              placeholder="Ej: 2"
            />
          </div>

          <div>
            <Label className="mb-2 block">Color del pin</Label>
            <PinColorPicker
              value={form.pinColor}
              onChange={(key) => update("pinColor", key)}
              disabled={saving}
            />
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <PinSwatch colorKey={form.pinColor} />
              {selectedColor.label}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Guardando…" : isEditing ? "Guardar" : "Crear tipo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
