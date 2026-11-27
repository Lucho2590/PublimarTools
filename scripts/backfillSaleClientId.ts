/**
 * Backfill de `clientId` en ventas convertidas desde una orden.
 *
 * Contexto:
 * La conversión orden→venta desde el listado de órdenes guardaba el cliente como
 * `client: "<id>"` (string) y no completaba `clientId`. La ficha del cliente las
 * buscaba con una segunda query pero mostraba una lista O la otra, así que las
 * ventas convertidas desde orden quedaban ocultas cuando el cliente tenía también
 * ventas directas. Además, todo lo que busca por `clientId` (ARCA, notas de
 * crédito, etc.) no las encontraba.
 *
 * Este script:
 * - Lee todas las ventas (saltea las borradas)
 * - Toma las que tienen `client` string y no tienen `clientId`
 * - Verifica que el cliente exista y no esté borrado
 * - Completa `clientId` (y `clientName` si falta). NO toca `client`.
 *
 * Corre en modo simulación por defecto. Para escribir en Firestore, pasar --apply:
 *
 *   npx ts-node scripts/backfillSaleClientId.ts            (simulación)
 *   npx ts-node scripts/backfillSaleClientId.ts --apply    (aplica los cambios)
 */

const admin = require('firebase-admin');
const path = require('path');

const APPLY = process.argv.includes('--apply');

if (admin.apps.length === 0) {
  const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');
  try {
    admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
  } catch (error) {
    console.error('❌ No se encontró firebase-service-account.json en la raíz del proyecto');
    process.exit(1);
  }
}

const db = admin.firestore();

async function backfillSaleClientId() {
  console.log(`\n🚀 Backfill de clientId en ventas ${APPLY ? '(MODO APLICAR)' : '(SIMULACIÓN)'}...\n`);

  const [salesSnap, clientsSnap] = await Promise.all([
    db.collection('sales').get(),
    db.collection('clients').get(),
  ]);
  const clients = new Map<string, any>(clientsSnap.docs.map((d: any) => [d.id, d.data()]));

  const toFix: { ref: any; number: string; clientId: string; data: Record<string, any> }[] = [];
  const skipped: string[] = [];

  for (const doc of salesSnap.docs) {
    const sale = doc.data();
    if (sale.deleted) continue;
    if (sale.clientId) continue;
    if (typeof sale.client !== 'string' || !sale.client) continue;

    const client = clients.get(sale.client);
    if (!client || client.deleted) {
      skipped.push(`${sale.number ?? doc.id} → cliente ${sale.client} ${client ? 'borrado' : 'inexistente'}`);
      continue;
    }

    const data: Record<string, any> = { clientId: sale.client };
    if (!sale.clientName && client.name) data.clientName = client.name;
    toFix.push({ ref: doc.ref, number: sale.number ?? doc.id, clientId: sale.client, data });
  }

  toFix.forEach((f) => console.log(`  • ${f.number} → clientId=${f.clientId}${f.data.clientName ? ` (clientName="${f.data.clientName}")` : ''}`));
  if (skipped.length) {
    console.log('\n⏭️  Salteadas:');
    skipped.forEach((s) => console.log(`  • ${s}`));
  }
  console.log(`\n📊 Ventas a corregir: ${toFix.length} · salteadas: ${skipped.length}`);

  if (!APPLY) {
    console.log('\nℹ️  Simulación: no se escribió nada. Correr con --apply para aplicar.\n');
    return;
  }

  // Lotes de hasta 450 escrituras (límite de Firestore: 500)
  for (let i = 0; i < toFix.length; i += 450) {
    const batch = db.batch();
    toFix.slice(i, i + 450).forEach((f) => batch.update(f.ref, f.data));
    await batch.commit();
  }
  console.log(`\n✅ ${toFix.length} ventas actualizadas.\n`);
}

backfillSaleClientId()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  });
