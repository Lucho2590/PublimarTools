# Scripts de Migración

## Migración de Departamento en Ventas

### Descripción
Este script agrega el campo `department` con valor `"banderas"` a todas las ventas existentes en Firestore.

### Requisitos Previos

1. **Archivo de credenciales de Firebase**
   - Ve a [Firebase Console](https://console.firebase.google.com/)
   - Selecciona tu proyecto
   - Ve a **Project Settings** (⚙️) > **Service Accounts**
   - Click en **Generate New Private Key**
   - Guarda el archivo como `serviceAccountKey.json` en la raíz del proyecto

2. **Instalar dependencias** (si no las tienes)
   ```bash
   pnpm add firebase-admin
   pnpm add -D ts-node @types/node
   ```

### Cómo Ejecutar

1. Asegúrate de tener el archivo `serviceAccountKey.json` en la raíz del proyecto

2. Ejecuta el script:
   ```bash
   pnpm dlx ts-node scripts/migrateSalesDepartment.ts
   ```

3. El script te mostrará el progreso en tiempo real:
   - ✅ Ventas actualizadas
   - ⏭️ Ventas que ya tenían el campo (omitidas)
   - ❌ Errores (si los hay)

4. Al finalizar verás un resumen con estadísticas

### Importante

⚠️ **Este script debe ejecutarse solo UNA VEZ**

Una vez ejecutado exitosamente, todas las ventas tendrán el campo `department: "banderas"`.

### Seguridad

🔒 **NUNCA subas el archivo `serviceAccountKey.json` a git**

Asegúrate de que esté en `.gitignore`:
```
serviceAccountKey.json
```

### Verificación

Después de ejecutar el script, puedes verificar en Firebase Console que las ventas tienen el campo `department`.

### Problemas Comunes

1. **Error: Cannot find module 'serviceAccountKey.json'**
   - Solución: Descarga el archivo de credenciales de Firebase Console

2. **Error: Permission denied**
   - Solución: Verifica que la cuenta de servicio tenga permisos de lectura/escritura en Firestore

3. **Error: ts-node not found**
   - Solución: Instala ts-node: `pnpm add -D ts-node`

---

## Reparación de Totales de Presupuestos

### Descripción

`fixQuoteTotals.ts` recalcula el campo `total` de los presupuestos que tienen descuentos
generales (`discountPercentage` / `manualDiscount`) y quedaron guardados sin restarlos.

El bug estaba en el alta de presupuesto con cliente nuevo, que guardaba `total = subtotal`
ignorando el descuento. El descuento sí se persistía, así que el PDF imprimía un total mayor
al real. El código ya está corregido; este script arregla los documentos previos.

### Cómo Ejecutar

Usa `firebase-service-account.json` de la raíz del proyecto (no `serviceAccountKey.json`).

```bash
# Simulación: lista qué presupuestos cambiarían, sin escribir nada
pnpm dlx ts-node --compiler-options '{"module":"commonjs"}' scripts/fixQuoteTotals.ts

# Aplicar los cambios
pnpm dlx ts-node --compiler-options '{"module":"commonjs"}' scripts/fixQuoteTotals.ts --apply
```

El script es idempotente: los presupuestos con el total ya correcto se omiten (tolerancia de
$1 para diferencias de redondeo).

### Estado

✅ Ejecutado el 17/8/2026 — 1 presupuesto reparado (`P-2026-1497`: $2.016.000 → $1.867.800).

---

## Reparación de descuentos de stock que nunca se aplicaron

### Descripción

`fixMissingStockDiscounts.ts` aplica el descuento de stock de las ventas que quedaron a
medias: existen en `sales` y la plata impactó en la cuenta, pero nunca se descontó el
inventario ni se escribió auditoría.

La causa: al importar un presupuesto en Ventas → Nueva, los renglones traían el `product`
recortado que guarda el presupuesto (sin el array `variants`). `createSale` hacía
`product.variants.map(...)` sobre `undefined` y tiraba una excepción **después** de crear la
venta y registrar el movimiento de cuenta. El usuario veía "Error al registrar la venta"
pero la venta ya estaba. El código ya está corregido (se rehidrata contra el catálogo con
`hydrateLineFromCatalog`, y el bloque de stock es best-effort); este script arregla los
documentos previos.

Identifica las ventas afectadas por su firma exacta: están en `sales` pero **no tienen su
evento `create` en `auditLog`**.

### Cómo Ejecutar

Usa `firebase-service-account.json` de la raíz del proyecto.

```bash
# Simulación: lista qué se descontaría, sin escribir nada
pnpm dlx ts-node --compiler-options '{"module":"commonjs"}' scripts/fixMissingStockDiscounts.ts

# Otra ventana de tiempo (default: 30 días)
pnpm dlx ts-node --compiler-options '{"module":"commonjs"}' scripts/fixMissingStockDiscounts.ts --days=60

# Aplicar los cambios
pnpm dlx ts-node --compiler-options '{"module":"commonjs"}' scripts/fixMissingStockDiscounts.ts --apply
```

### Seguridad

- Sólo toca ventas **sin** evento `create` en auditoría. Una venta normal no se toca nunca.
- Saltea las ventas con `orderId`: el flujo viejo de orden→venta descontaba sin auditar, así
  que "no tiene evento" no significa "no descontó". Tocarlas descontaría dos veces.
- Es idempotente: si el renglón ya tiene un `stock_change` asociado a esa venta, lo saltea.
- Deja rastro: escribe el `stock_change` con `reason: "fix_missing_discount"`.

### Desde la app (recomendado)

La pestaña **Sudo → Conciliación de stock** hace lo mismo desde la UI: corre el cruce en
vivo (ventas vs. movimientos de auditoría vs. stock real), lista las ventas a medias y
tiene un botón **Corregir** por venta (o "corregir todas") que descuenta el stock pendiente
y reconstruye la auditoría, con un diálogo que detalla renglón por renglón lo que va a
descontar. La lógica vive en `src/lib/stockReconciliation.ts` y aplica las mismas
protecciones que este script.

Este script queda para correcciones masivas o fuera de la app.
