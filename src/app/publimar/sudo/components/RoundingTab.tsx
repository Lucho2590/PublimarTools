"use client";

import { useEffect, useMemo, useState } from "react";
import { useFirestore } from "reactfire";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowDown,
  ArrowUp,
  Calculator,
  ListChecks,
  Minus,
  RefreshCw,
  Save,
} from "lucide-react";
import collections from "@/lib/collections";
import { DEFAULT_ROUNDING, TRoundingConfig, formatearPrecio, redondearPrecio } from "@/lib/utils";
import { getRoundingConfig, saveRoundingConfig } from "@/lib/pricingConfig";
import { useAuditLog } from "@/hooks/useAuditLog";
import { EAuditAction, EAuditEntityType, EAuditSection } from "@/lib/auditLog";
import { recordPriceChanges } from "@/lib/priceHistory";
import { EPriceChangeSource, TPriceChangeInput } from "@/types/priceHistory";
import { TProduct, TProductVariant } from "@/types/product";

type SampleRow = {
  key: string;
  label: string;
  price: number;
};

// Fila del re-redondeo masivo: un precio (variante o precio base del producto).
type BulkRow = {
  key: string;
  productId: string;
  variantKey: string | null; // null = precio top-level del producto
  label: string;
  current: number;
  nuevo: number;
  changed: boolean;
  direction: "up" | "down" | "same";
};

// Cuántas variantes mostrar en el simulador.
const SAMPLE_SIZE = 20;

// Clave única por precio, estable entre "generar lista" y "aplicar".
const rowKeyFor = (productId: string, variantKey: string | null) =>
  `${productId}::${variantKey ?? "__base"}`;

// Firestore permite hasta 500 operaciones por batch; dejamos margen.
const BATCH_SIZE = 450;

export function RoundingTab() {
  const firestore = useFirestore();
  const { logEvent, actor } = useAuditLog();

  // Config persistida (última guardada) y borrador editable del formulario.
  const [savedConfig, setSavedConfig] = useState<TRoundingConfig>(DEFAULT_ROUNDING);
  const [config, setConfig] = useState<TRoundingConfig>(DEFAULT_ROUNDING);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);

  // Simulador.
  const [percentage, setPercentage] = useState("");
  const [manualPrice, setManualPrice] = useState(0);
  const [sample, setSample] = useState<SampleRow[]>([]);
  const [loadingSample, setLoadingSample] = useState(true);

  // Re-redondeo masivo de precios existentes.
  const [bulkRows, setBulkRows] = useState<BulkRow[] | null>(null); // null = lista no generada
  const [bulkProducts, setBulkProducts] = useState<TProduct[]>([]); // productos crudos para reconstruir al aplicar
  const [bulkConfig, setBulkConfig] = useState<TRoundingConfig>(DEFAULT_ROUNDING); // config con la que se generó la lista
  const [approved, setApproved] = useState<Set<string>>(new Set()); // filas tildadas (OK)
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const loadConfig = async () => {
    setLoadingConfig(true);
    try {
      const c = await getRoundingConfig(firestore);
      setSavedConfig(c);
      setConfig(c);
    } finally {
      setLoadingConfig(false);
    }
  };

  const loadSample = async () => {
    setLoadingSample(true);
    try {
      const snap = await getDocs(collection(firestore, collections.PRODUCTS));
      const rows: SampleRow[] = [];
      for (const d of snap.docs) {
        const data = d.data() as any;
        if (data.deleted === true) continue; // excluir eliminados (campo puede no existir)
        const p = { id: d.id, ...data } as TProduct;
        const variants = Array.isArray(p.variants) ? p.variants : [];
        for (const v of variants as TProductVariant[]) {
          const price = Number(v.price);
          if (!price || isNaN(price)) continue;
          rows.push({
            key: `${p.id}-${v.id ?? v.size}`,
            label: v.size ? `${p.name} · ${v.size}` : p.name,
            price,
          });
          if (rows.length >= SAMPLE_SIZE) break;
        }
        if (rows.length >= SAMPLE_SIZE) break;
      }
      setSample(rows);
    } catch (error) {
      console.error("Error cargando productos de muestra:", error);
      toast.error("No se pudieron cargar productos de muestra");
    } finally {
      setLoadingSample(false);
    }
  };

  useEffect(() => {
    loadConfig();
    loadSample();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore]);

  const pct = useMemo(() => {
    const n = Number(percentage);
    return isNaN(n) ? 0 : n;
  }, [percentage]);

  const isDirty = useMemo(
    () =>
      config.multiplo !== savedConfig.multiplo ||
      config.direccion !== savedConfig.direccion ||
      config.terminacion !== savedConfig.terminacion,
    [config, savedConfig]
  );

  // Calcula precio con aumento aplicado (sin redondear) según el % del simulador.
  const conAumento = (price: number) => price * (1 + pct / 100);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveRoundingConfig(firestore, config);
      setSavedConfig(config);
      toast.success("Configuración de redondeo guardada");
    } catch (error) {
      console.error("Error guardando config de redondeo:", error);
      toast.error("No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  // ── Re-redondeo masivo ────────────────────────────────────────────────

  const buildBulkRow = (
    productId: string,
    variantKey: string | null,
    label: string,
    current: number,
    cfg: TRoundingConfig
  ): BulkRow => {
    const nuevo = redondearPrecio(current, cfg);
    return {
      key: rowKeyFor(productId, variantKey),
      productId,
      variantKey,
      label,
      current,
      nuevo,
      changed: nuevo !== current,
      direction: nuevo > current ? "up" : nuevo < current ? "down" : "same",
    };
  };

  const generateBulkList = async () => {
    setGenerating(true);
    try {
      const cfg = savedConfig; // usar SIEMPRE la config guardada
      const snap = await getDocs(collection(firestore, collections.PRODUCTS));
      const prods: TProduct[] = [];
      const rows: BulkRow[] = [];
      for (const d of snap.docs) {
        const data = d.data() as any;
        if (data.deleted === true) continue; // excluir eliminados (campo puede no existir)
        const p = { id: d.id, ...data } as TProduct;
        prods.push(p);
        const variants = Array.isArray(p.variants) ? p.variants : [];
        if (variants.length > 0) {
          for (const v of variants as TProductVariant[]) {
            const current = Number(v.price);
            if (!current || isNaN(current)) continue;
            rows.push(
              buildBulkRow(
                p.id,
                v.id ?? v.size,
                v.size ? `${p.name} · ${v.size}` : p.name,
                current,
                cfg
              )
            );
          }
        } else {
          const current = Number(p.price);
          if (!current || isNaN(current)) continue;
          rows.push(buildBulkRow(p.id, null, p.name, current, cfg));
        }
      }
      // Primero las que cambian (para revisarlas arriba), después el resto.
      rows.sort((a, b) => Number(b.changed) - Number(a.changed));
      setBulkProducts(prods);
      setBulkConfig(cfg);
      setBulkRows(rows);
      setApproved(new Set()); // arrancan sin tildar: verificación manual
    } catch (error) {
      console.error("Error generando lista de redondeo:", error);
      toast.error("No se pudo generar la lista");
    } finally {
      setGenerating(false);
    }
  };

  const changedRows = useMemo(
    () => (bulkRows ?? []).filter((r) => r.changed),
    [bulkRows]
  );
  const approvedChangedCount = useMemo(
    () => changedRows.filter((r) => approved.has(r.key)).length,
    [changedRows, approved]
  );
  const upCount = useMemo(
    () => changedRows.filter((r) => r.direction === "up").length,
    [changedRows]
  );
  const downCount = changedRows.length - upCount;
  const allChangedApproved =
    changedRows.length > 0 && approvedChangedCount === changedRows.length;

  const toggleApprove = (key: string, checked: boolean) => {
    setApproved((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChangedApproved) setApproved(new Set());
    else setApproved(new Set(changedRows.map((r) => r.key)));
  };

  const applyBulk = async () => {
    if (!bulkRows) return;
    const toApply = changedRows.filter((r) => approved.has(r.key));
    if (toApply.length === 0) {
      toast.error("No hay cambios tildados para aplicar");
      return;
    }
    const pending = changedRows.length - toApply.length;
    if (pending > 0) {
      if (
        !confirm(
          `Hay ${pending} cambio(s) sin verificar. ¿Aplicar solo los ${toApply.length} tildado(s)?`
        )
      )
        return;
    } else if (
      !confirm(
        `Vas a aplicar ${toApply.length} cambio(s) de precio. Esta acción no se puede deshacer. ¿Continuar?`
      )
    ) {
      return;
    }

    const approvedKeys = new Set(toApply.map((r) => r.key));
    // Productos que tienen al menos una fila tildada.
    const affected = bulkProducts.filter((p) => {
      const variants = Array.isArray(p.variants) ? p.variants : [];
      if (variants.length > 0)
        return variants.some((v: any) =>
          approvedKeys.has(rowKeyFor(p.id, v.id ?? v.size))
        );
      return approvedKeys.has(rowKeyFor(p.id, null));
    });

    setApplying(true);
    setProgress({ done: 0, total: affected.length });
    const priceChanges: TPriceChangeInput[] = [];
    try {
      let done = 0;
      for (let i = 0; i < affected.length; i += BATCH_SIZE) {
        const chunk = affected.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(firestore);
        for (const p of chunk) {
          const ref = doc(firestore, collections.PRODUCTS, p.id);
          const variants = Array.isArray(p.variants) ? p.variants : [];
          if (variants.length > 0) {
            const newVariants = variants.map((v: any) => {
              const k = rowKeyFor(p.id, v.id ?? v.size);
              if (!approvedKeys.has(k)) return v;
              const oldPrice = Number(v.price);
              const newPrice = redondearPrecio(oldPrice, bulkConfig);
              priceChanges.push({
                productId: p.id,
                productName: p.name,
                variantId: v.id ?? null,
                variantSize: v.size ?? null,
                oldPrice,
                newPrice,
              });
              return { ...v, price: newPrice };
            });
            batch.update(ref, {
              variants: newVariants,
              updatedAt: serverTimestamp(),
            });
          } else {
            const oldPrice = Number(p.price);
            const newPrice = redondearPrecio(oldPrice, bulkConfig);
            priceChanges.push({
              productId: p.id,
              productName: p.name,
              variantId: null,
              variantSize: null,
              oldPrice,
              newPrice,
            });
            batch.update(ref, {
              price: newPrice,
              updatedAt: serverTimestamp(),
            });
          }
        }
        await batch.commit();
        done += chunk.length;
        setProgress({ done, total: affected.length });
      }

      // Historial de cambios de precio (un lote).
      await recordPriceChanges(
        firestore,
        actor,
        priceChanges,
        EPriceChangeSource.REDONDEO_MASIVO
      );

      await logEvent({
        section: EAuditSection.SUDO,
        entityType: EAuditEntityType.PRODUCT,
        entityId: "bulk-rounding",
        entityLabel: "Redondeo masivo de precios",
        action: EAuditAction.UPDATE,
        description: `Re-redondeó ${toApply.length} precio(s) de ${affected.length} producto(s)`,
        metadata: {
          config: bulkConfig,
          productosAfectados: affected.length,
          preciosAfectados: toApply.length,
        },
      });

      toast.success(
        `Se aplicaron ${toApply.length} cambio(s) en ${affected.length} producto(s)`
      );
      // Limpiar la lista; la próxima "Generar lista" reflejará el estado ya aplicado.
      setBulkRows(null);
      setBulkProducts([]);
      setApproved(new Set());
      loadSample();
    } catch (error) {
      console.error("Error aplicando redondeo masivo:", error);
      toast.error("Error al aplicar los cambios");
    } finally {
      setApplying(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-900" />
            Redondeo de precios
          </CardTitle>
          <Button
            onClick={handleSave}
            disabled={!isDirty || saving || loadingConfig}
          >
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta configuración se usa al aplicar <strong>aumentos</strong> de
            precios a los productos. Probá abajo cómo quedan los precios antes de
            guardar.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Múltiplo</Label>
              <Select
                value={String(config.multiplo)}
                onValueChange={(v) =>
                  setConfig((c) => ({ ...c, multiplo: Number(v) as 10 | 50 | 100 }))
                }
                disabled={config.terminacion !== "ninguna"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">A la decena (10)</SelectItem>
                  <SelectItem value="50">A 50</SelectItem>
                  <SelectItem value="100">A la centena (100)</SelectItem>
                </SelectContent>
              </Select>
              {config.terminacion !== "ninguna" && (
                <p className="text-xs text-muted-foreground">
                  Ignorado cuando hay terminación (paso de 100).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Select
                value={config.direccion}
                onValueChange={(v) =>
                  setConfig((c) => ({ ...c, direccion: v as TRoundingConfig["direccion"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cercano">Al más cercano</SelectItem>
                  <SelectItem value="arriba">Siempre para arriba</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Terminación</Label>
              <Select
                value={config.terminacion}
                onValueChange={(v) =>
                  setConfig((c) => ({ ...c, terminacion: v as TRoundingConfig["terminacion"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguna">Ninguna</SelectItem>
                  <SelectItem value="90">Terminar en …90</SelectItem>
                  <SelectItem value="99">Terminar en …99</SelectItem>
                  <SelectItem value="00">Terminar en …00</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Simulador</CardTitle>
          <Button
            onClick={loadSample}
            variant="outline"
            disabled={loadingSample}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingSample ? "animate-spin" : ""}`} />
            Recargar productos
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pct">Aumento a simular (%)</Label>
              <Input
                id="pct"
                inputMode="decimal"
                placeholder="Ej: 15"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                className="max-w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual">Probar con un precio manual</Label>
              <div className="flex items-center gap-3">
                <MoneyInput
                  id="manual"
                  value={manualPrice}
                  onValueChange={setManualPrice}
                  className="max-w-[180px]"
                />
                {manualPrice > 0 && (
                  <span className="text-sm text-muted-foreground">
                    → con aumento {formatearPrecio(conAumento(manualPrice))} →{" "}
                    <strong className="text-foreground">
                      {formatearPrecio(redondearPrecio(conAumento(manualPrice), config))}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Precio actual</TableHead>
                  <TableHead className="text-right">Con aumento (+{pct || 0}%)</TableHead>
                  <TableHead className="text-right">Redondeado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSample ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Cargando productos…
                    </TableCell>
                  </TableRow>
                ) : sample.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No hay productos para simular
                    </TableCell>
                  </TableRow>
                ) : (
                  sample.map((row) => {
                    const aumentado = conAumento(row.price);
                    const redondeado = redondearPrecio(aumentado, config);
                    return (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatearPrecio(row.price)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatearPrecio(aumentado)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatearPrecio(redondeado)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-blue-900" />
            Aplicar a precios existentes
          </CardTitle>
          <Button
            onClick={generateBulkList}
            variant="outline"
            disabled={generating || applying || isDirty || loadingConfig}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${generating ? "animate-spin" : ""}`} />
            {bulkRows ? "Regenerar lista" : "Generar lista"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Re-redondea los precios <strong>ya cargados</strong> con la configuración
            guardada (sin aumento). Revisá cada cambio, tildá el <strong>OK</strong> y
            luego <strong>Aplicá los cambios</strong>. ⚠️ Algunos precios pueden bajar y{" "}
            <strong>la acción no se puede deshacer</strong>.
          </p>

          {isDirty && (
            <p className="text-sm text-amber-600">
              Tenés cambios de configuración sin guardar. Guardá la configuración
              antes de generar la lista.
            </p>
          )}

          {bulkRows === null ? (
            <div className="text-center py-8 text-muted-foreground">
              Generá la lista para ver los precios con la config actual.
            </div>
          ) : bulkRows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay precios para procesar.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  {bulkRows.length} precios · {changedRows.length} cambian
                  {changedRows.length > 0 && (
                    <>
                      {" "}
                      (<span className="text-emerald-600">{upCount} suben</span> /{" "}
                      <span className="text-red-600">{downCount} bajan</span>) ·{" "}
                      <strong className="text-foreground">
                        {approvedChangedCount} de {changedRows.length} verificados
                      </strong>
                    </>
                  )}
                </div>
                {changedRows.length > 0 && (
                  <Button variant="outline" size="sm" onClick={toggleAll} disabled={applying}>
                    {allChangedApproved ? "Destildar todos" : "Tildar todos"}
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-[48px] text-center">OK</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Precio actual</TableHead>
                      <TableHead className="text-right">Precio nuevo</TableHead>
                      <TableHead className="w-[110px] text-center">Cambio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkRows.map((row) => (
                      <TableRow
                        key={row.key}
                        className={row.changed ? "" : "opacity-60"}
                      >
                        <TableCell className="text-center">
                          {row.changed ? (
                            <Checkbox
                              checked={approved.has(row.key)}
                              disabled={applying}
                              onCheckedChange={(v) => toggleApprove(row.key, v === true)}
                              aria-label={`Verificar ${row.label}`}
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatearPrecio(row.current)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatearPrecio(row.nuevo)}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.direction === "up" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <ArrowUp className="h-3.5 w-3.5" /> Sube
                            </span>
                          ) : row.direction === "down" ? (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <ArrowDown className="h-3.5 w-3.5" /> Baja
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Minus className="h-3.5 w-3.5" /> Igual
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-end gap-3">
                {progress && (
                  <span className="text-sm text-muted-foreground">
                    Procesando {progress.done}/{progress.total}…
                  </span>
                )}
                <Button
                  onClick={applyBulk}
                  disabled={applying || changedRows.length === 0}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {applying
                    ? "Aplicando…"
                    : `Aplicar los cambios (${approvedChangedCount})`}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
