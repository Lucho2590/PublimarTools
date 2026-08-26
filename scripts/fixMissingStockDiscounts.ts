/**
 * Script de reparación de descuentos de stock que nunca se aplicaron
 *
 * Contexto:
 * Al importar un presupuesto en Ventas → Nueva, los renglones traían el `product`
 * recortado que guarda el presupuesto (sin el array `variants`). `createSale`
 * hacía `product.variants.map(...)` sobre undefined y tiraba una excepción
 * DESPUÉS de haber creado la venta y registrado los movimientos de cuenta.
 * Resultado: la venta quedó en la DB, la plata impactó, pero el stock nunca se
 * descontó y no se escribió ningún evento de auditoría.
 *
 * La firma de esas ventas es exacta: existen en `sales` pero NO tienen su evento
 * `create` en `auditLog`. Este script busca esas ventas y aplica el descuento
 * pendiente, dejando el `stock_change` correspondiente para que quede el rastro.
 *
 * Seguridad:
 * - Sólo toca ventas SIN evento `create` en auditoría. Una venta normal, aunque
 *   tenga renglones raros, no se toca.
 * - Saltea las ventas con `orderId`: el flujo viejo de orden→venta descontaba sin
 *   auditar, así que "no tiene evento" no significa "no descontó". Tocarlas
 *   descontaría dos veces.
 * - Es idempotente: si el item ya tiene un `stock_change` asociado a esa venta,
 *   lo saltea.
 *
 * Corre en modo simulación por defecto. Para escribir en Firestore, pasar --apply:
 *
 *   npx ts-node scripts/fixMissingStockDiscounts.ts              (simulación)
 *   npx ts-node scripts/fixMissingStockDiscounts.ts --days=60    (otra ventana)
 *   npx ts-node scripts/fixMissingStockDiscounts.ts --apply      (aplica)
 */

const admin = require('firebase-admin');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const daysArg = process.argv.find((a: string) => a.startsWith('--days='));
const DAYS = daysArg ? Number(daysArg.split('=')[1]) : 30;

if (admin.apps.length === 0) {
  const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');
  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('✅ Firebase Admin inicializado correctamente');
  } catch (error) {
    console.error('❌ Error al cargar las credenciales de Firebase:');
    console.error('   Asegurate de tener firebase-service-account.json en la raíz del proyecto');
    process.exit(1);
  }
}

const db = admin.firestore();

const formatearPrecio = (valor: number): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor);

/** Mismo criterio que src/lib/stock.ts: descuenta salvo `discountStock === false`. */
const variantDiscountsStock = (variant: any): boolean =>
  variant?.discountStock !== false;

/** Mismo criterio que el resto de la app para detectar renglones manuales. */
const esManual = (item: any): boolean =>
  !!item?.isManual || !item?.productId || String(item.productId).includes('manual');

async function fixMissingStockDiscounts() {
  console.log(
    `\n🚀 Buscando descuentos de stock pendientes de los últimos ${DAYS} días ${
      APPLY ? '(MODO APLICAR)' : '(SIMULACIÓN)'
    }...\n`
  );

  const desde = new Date(Date.now() - DAYS * 24 * 3600 * 1000);

  const [salesSnap, auditSnap] = await Promise.all([
    db.collection('sales').where('createdAt', '>=', desde).get(),
    db.collection('auditLog').where('timestamp', '>=', desde).get(),
  ]);

  const ventasAuditadas = new Set<string>();
  const movsPorVenta = new Map<string, any[]>();
  auditSnap.forEach((d: any) => {
    const v = d.data();
    const m = v.metadata || {};
    if (v.action === 'create' && v.entityType === 'sale') ventasAuditadas.add(v.entityId);
    if (v.action === 'stock_change' && m.saleId) {
      if (!movsPorVenta.has(m.saleId)) movsPorVenta.set(m.saleId, []);
      movsPorVenta.get(m.saleId)!.push(m);
    }
  });

  console.log(`📊 Ventas en la ventana: ${salesSnap.size}`);

  // Acumulamos por producto: una venta puede tener varios renglones del mismo
  // documento y hay que escribir un solo update con todos los descuentos.
  type Pendiente = {
    saleId: string;
    saleNumber: string;
    productId: string;
    productName: string;
    variantId: string;
    variantName: string;
    quantity: number;
  };
  const pendientes: Pendiente[] = [];
  const noVerificables: string[] = [];
  let ventasRotas = 0;
  let salteadasPorOrden = 0;

  salesSnap.forEach((d: any) => {
    const venta = d.data();
    if (venta.deleted) return;
    if (ventasAuditadas.has(d.id)) return;

    if (venta.orderId) {
      salteadasPorOrden++;
      return;
    }

    ventasRotas++;
    const movs = movsPorVenta.get(d.id) || [];

    (venta.items || []).forEach((item: any) => {
      if (esManual(item)) return;
      const yaDescontado = movs.some(
        (m) => m.productId === item.productId && m.variantId === item.variantId
      );
      if (yaDescontado) return;
      pendientes.push({
        saleId: d.id,
        saleNumber: venta.number || d.id,
        productId: item.productId,
        productName: item.productName || '',
        variantId: item.variantId,
        variantName: item.variantName || '',
        quantity: Number(item.quantity) || 0,
      });
    });
  });

  console.log(`🔴 Ventas a medias (sin evento create): ${ventasRotas}`);
  console.log(`⏭️  Ventas con orderId salteadas (descontaron sin auditar): ${salteadasPorOrden}`);
  console.log(`📦 Renglones con descuento pendiente: ${pendientes.length}\n`);

  if (pendientes.length === 0) {
    console.log('✨ Nada para corregir.');
    return;
  }

  // Agrupamos por producto para hacer un solo write por documento.
  const porProducto = new Map<string, Pendiente[]>();
  for (const p of pendientes) {
    if (!porProducto.has(p.productId)) porProducto.set(p.productId, []);
    porProducto.get(p.productId)!.push(p);
  }

  let aplicados = 0;

  for (const [productId, lineas] of Array.from(porProducto.entries())) {
    const productRef = db.collection('products').doc(productId);
    const productSnap = await productRef.get();

    if (!productSnap.exists) {
      noVerificables.push(`${lineas[0].productName} (producto ${productId} ya no existe)`);
      continue;
    }

    const producto = productSnap.data();
    const variants = producto.variants || [];
    const nuevasVariantes = variants.map((v: any) => ({ ...v }));
    const eventos: any[] = [];

    for (const l of lineas) {
      const idx = nuevasVariantes.findIndex((v: any) => v.id === l.variantId);
      if (idx === -1) {
        noVerificables.push(`${l.productName} · ${l.variantName} (variante ya no existe)`);
        continue;
      }
      if (!variantDiscountsStock(nuevasVariantes[idx])) {
        console.log(`   ⏭️  ${l.productName} · ${l.variantName}: la variante no descuenta stock`);
        continue;
      }

      const stockBefore = Number(nuevasVariantes[idx].stock) || 0;
      const stockAfter = stockBefore - l.quantity;
      nuevasVariantes[idx].stock = stockAfter;

      console.log(
        `   ${l.productName} · ${l.variantName} — venta ${l.saleNumber}: ${stockBefore} → ${stockAfter} (−${l.quantity})`
      );

      eventos.push({
        userId: null,
        userEmail: null,
        userName: 'script:fixMissingStockDiscounts',
        userRole: null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        section: 'banderas_stock',
        entityType: 'productVariant',
        entityId: `${productId}:${l.variantId}`,
        entityLabel: `${l.productName}${l.variantName ? ` · ${l.variantName}` : ''}`,
        action: 'stock_change',
        description: `-${l.quantity} en stock de ${l.productName}${
          l.variantName ? ` (${l.variantName})` : ''
        } por corrección de venta sin descuento`,
        metadata: {
          reason: 'fix_missing_discount',
          saleId: l.saleId,
          saleNumber: l.saleNumber,
          productId,
          productName: l.productName,
          variantId: l.variantId,
          variantName: l.variantName,
          stockBefore,
          stockAfter,
          delta: -l.quantity,
        },
      });
    }

    if (eventos.length === 0) continue;

    if (APPLY) {
      await productRef.update({ variants: nuevasVariantes });
      for (const ev of eventos) await db.collection('auditLog').add(ev);
    }
    aplicados += eventos.length;
  }

  if (noVerificables.length > 0) {
    console.log('\n⚠️  No verificables (hay que ajustarlos a mano):');
    noVerificables.forEach((n) => console.log(`   - ${n}`));
  }

  console.log(
    `\n${APPLY ? '✅ Aplicados' : '🔎 Se aplicarían'}: ${aplicados} descuentos de stock`
  );
  if (!APPLY) console.log('   Volvé a correr con --apply para escribir en Firestore.');
}

fixMissingStockDiscounts()
  .then(() => process.exit(0))
  .catch((e: any) => {
    console.error('❌ Error:', e);
    process.exit(1);
  });
