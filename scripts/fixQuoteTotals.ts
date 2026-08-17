/**
 * Script de reparación de totales de presupuestos
 *
 * Contexto:
 * Hasta este fix, el alta de presupuesto con cliente nuevo guardaba `total = subtotal`,
 * ignorando los descuentos generales (`discountPercentage` / `manualDiscount`). El
 * descuento sí quedaba persistido, pero el total no lo restaba, por lo que el PDF
 * imprimía un total mayor al real.
 *
 * Este script:
 * - Lee todos los presupuestos de la colección 'quotes' (saltea los borrados)
 * - Considera solo los que tienen algún descuento general aplicado
 * - Recalcula el total esperado y actualiza los que estén desfasados
 *
 * Corre en modo simulación por defecto. Para escribir en Firestore, pasar --apply:
 *
 *   npx ts-node scripts/fixQuoteTotals.ts            (simulación)
 *   npx ts-node scripts/fixQuoteTotals.ts --apply    (aplica los cambios)
 */

const admin = require('firebase-admin');
const path = require('path');

const APPLY = process.argv.includes('--apply');

// Inicializar Firebase Admin
if (admin.apps.length === 0) {
  const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');

  try {
    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log('✅ Firebase Admin inicializado correctamente');
  } catch (error) {
    console.error('❌ Error al cargar las credenciales de Firebase:');
    console.error('   Asegúrate de tener el archivo firebase-service-account.json en la raíz del proyecto');
    console.error('   Puedes descargarlo desde: Firebase Console > Project Settings > Service Accounts');
    process.exit(1);
  }
}

const db = admin.firestore();

// Mismo redondeo que usa la app (src/lib/utils.ts)
const redondearTotal = (value: number): number => Math.round(value * 100) / 100;

const formatearPrecio = (valor: number): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor);

async function fixQuoteTotals() {
  console.log(`\n🚀 Revisando totales de presupuestos ${APPLY ? '(MODO APLICAR)' : '(SIMULACIÓN)'}...\n`);

  try {
    const quotesSnapshot = await db.collection('quotes').get();

    console.log(`📊 Total de presupuestos encontrados: ${quotesSnapshot.size}`);

    if (quotesSnapshot.empty) {
      console.log('⚠️  No hay presupuestos para revisar');
      return;
    }

    let withDiscount = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of quotesSnapshot.docs) {
      const quote = doc.data();

      if (quote.deleted) continue;

      const discountPercentage = Number(quote.discountPercentage) || 0;
      const manualDiscount = Number(quote.manualDiscount) || 0;

      // Solo interesan los presupuestos con algún descuento general
      if (discountPercentage <= 0 && manualDiscount <= 0) continue;

      withDiscount++;

      // Cuando se desglosa IVA, el subtotal guardado ya es el neto: esa es la base
      // del descuento porcentual, igual que en la app.
      const subtotal = Number(quote.subtotal) || 0;
      const taxAmount = Number(quote.taxAmount ?? quote.tax) || 0;
      const percentageDiscountAmount = (subtotal * discountPercentage) / 100;
      const expectedTotal = redondearTotal(
        subtotal + taxAmount - (percentageDiscountAmount + manualDiscount)
      );

      const currentTotal = Number(quote.total) || 0;

      // Tolerancia de $1 para no tocar documentos por diferencias de redondeo
      if (Math.abs(currentTotal - expectedTotal) <= 1) {
        skipped++;
        console.log(`⏭️  ${quote.number} ya tiene el total correcto (${formatearPrecio(currentTotal)})`);
        continue;
      }

      console.log(
        `🔧 ${quote.number}: ${formatearPrecio(currentTotal)} → ${formatearPrecio(expectedTotal)} ` +
        `(subtotal ${formatearPrecio(subtotal)}, descuento ${formatearPrecio(percentageDiscountAmount + manualDiscount)})`
      );

      if (!APPLY) {
        updated++;
        continue;
      }

      try {
        await doc.ref.update({ total: expectedTotal });
        updated++;
        console.log(`   ✅ Actualizado`);
      } catch (error) {
        errors++;
        console.error(`   ❌ Error al actualizar presupuesto ${doc.id}:`, error);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📋 RESUMEN');
    console.log('='.repeat(50));
    console.log(`Total de presupuestos:   ${quotesSnapshot.size}`);
    console.log(`Con descuento:            ${withDiscount}`);
    console.log(`${APPLY ? '✅ Actualizados:' : '🔍 A actualizar:'}          ${updated}`);
    console.log(`⏭️  Ya correctos:         ${skipped}`);
    console.log(`❌ Errores:               ${errors}`);
    console.log('='.repeat(50));

    if (!APPLY && updated > 0) {
      console.log('\n💡 Simulación: no se escribió nada. Volvé a correrlo con --apply para aplicar los cambios.\n');
    } else if (errors === 0) {
      console.log('\n✨ Listo!\n');
    } else {
      console.log('\n⚠️  Finalizado con errores. Revisa los logs arriba.\n');
    }

  } catch (error) {
    console.error('\n❌ Error fatal durante la reparación:', error);
    process.exit(1);
  }
}

fixQuoteTotals()
  .then(() => {
    console.log('🏁 Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Error no controlado:', error);
    process.exit(1);
  });
