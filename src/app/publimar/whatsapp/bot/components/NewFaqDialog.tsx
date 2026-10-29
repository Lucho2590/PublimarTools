"use client";

import { useEffect, useState } from "react";
import { useFirestore } from "reactfire";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import collections from "@/lib/collections";
import { BOT_TEMPLATE_VARS } from "@/lib/bot/defaults";
import { normalizeText } from "@/lib/bot/normalize";
import { EBotIntentKind } from "@/types/bot";

/** Crea una pregunta frecuente. `initialExample` viene de "Por aprender". */
export function NewFaqDialog({
  open,
  onOpenChange,
  initialExample = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialExample?: string;
  onCreated?: (intentId: string) => void;
}) {
  const firestore = useFirestore();
  const [label, setLabel] = useState("");
  const [examples, setExamples] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel("");
      setExamples(initialExample);
      setAnswer("");
    }
  }, [open, initialExample]);

  const save = async () => {
    const list = examples
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!label.trim() || !list.length || !answer.trim()) {
      toast.error("Completá título, al menos una frase y la respuesta");
      return;
    }
    setSaving(true);
    try {
      const slug = normalizeText(label).replace(/\s+/g, "_").slice(0, 40) || "faq";
      const id = `faq_${slug}_${Date.now().toString(36)}`;
      await setDoc(doc(firestore, collections.BOT_INTENTS, id), {
        label: label.trim(),
        kind: EBotIntentKind.FAQ,
        action: null,
        examples: list,
        answer: answer.trim(),
        enabled: true,
        hits: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Pregunta frecuente creada");
      onCreated?.(id);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva pregunta frecuente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Título</Label>
            <Input placeholder="Ej: Banderas personalizadas" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Frases de ejemplo (una por línea)</Label>
            <Textarea
              rows={4}
              placeholder={"hacen banderas con logo\npueden estampar mi escudo"}
              value={examples}
              onChange={(e) => setExamples(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Respuesta</Label>
            <Textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <p className="text-xs text-slate-500">
              Variables: {BOT_TEMPLATE_VARS.map((v) => `{${v.key}}`).join(" ")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
