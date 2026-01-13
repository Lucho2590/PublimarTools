/**
 * Script de corrección para agregar el campo 'department: banderas' a las ventas
 * que fueron convertidas desde órdenes de trabajo.
 *
 * Este script:
 * - Lee todas las ventas de la colección 'sales'
 * - Identifica las que vienen de órdenes (number comienza con "#O-")
 * - Agrega el campo 'department: banderas' solo a las que no lo tienen
 * - Muestra el progreso en consola
 *
 * IMPORTANTE: Este script es seguro de ejecutar múltiples veces (no duplica datos)
 *
 * Para ejecutar:
 * npx ts-node scripts/fixOrderSalesDepartment.ts
 */

const admin = require('firebase-admin');
const path = require('path');

// Inicializar Firebase Admin
if (admin.apps.length === 0) {
  // Ajusta la ruta a tu archivo de credenciales de Firebase
  const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

  try {
    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log('✅ Firebase Admin inicializado correctamente');
  } catch (error) {
    console.error('❌ Error al cargar las credenciales de Firebase:');
    console.error('   Asegúrate de tener el archivo serviceAccountKey.json en la raíz del proyecto');
    console.error('   Puedes descargarlo desde: Firebase Console > Project Settings > Service Accounts');
    process.exit(1);
  }
}

const db = admin.firestore();

async function fixOrderSalesDepartment() {
  console.log('\n🚀 Iniciando corrección de ventas provenientes de órdenes...\n');

  try {
    // Obtener todas las ventas
    const salesSnapshot = await db.collection('sales').get();

    console.log(`📊 Total de ventas en la base de datos: ${salesSnapshot.size}`);

    if (salesSnapshot.empty) {
      console.log('⚠️  No hay ventas en la base de datos');
      return;
    }

    let orderSalesFound = 0;
    let updated = 0;
    let alreadyHadDepartment = 0;
    let nonOrderSales = 0;
    let errors = 0;

    // Procesar cada venta
    for (const doc of salesSnapshot.docs) {
      const saleData = doc.data();
      const saleNumber = saleData.number || '';

      // Verificar si es una venta que viene de una orden (number comienza con "#O-")
      if (saleNumber.startsWith('#O-') || saleNumber.startsWith('O-')) {
        orderSalesFound++;

        // Solo actualizar si no tiene el campo 'department'
        if (!saleData.department) {
          try {
            await doc.ref.update({
              department: 'banderas'
            });
            updated++;
            console.log(`✅ Venta ${saleNumber} (ID: ${doc.id}) actualizada - [${updated}/${orderSalesFound}]`);
          } catch (error) {
            errors++;
            console.error(`❌ Error al actualizar venta ${saleNumber}:`, error);
          }
        } else {
          alreadyHadDepartment++;
          console.log(`⏭️  Venta ${saleNumber} ya tiene department: ${saleData.department}`);
        }
      } else {
        nonOrderSales++;
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('📋 RESUMEN DE CORRECCIÓN');
    console.log('='.repeat(60));
    console.log(`Total de ventas en la BD:                ${salesSnapshot.size}`);
    console.log(`🔍 Ventas provenientes de órdenes (#O-): ${orderSalesFound}`);
    console.log(`✅ Actualizadas con department:          ${updated}`);
    console.log(`⏭️  Ya tenían department:                 ${alreadyHadDepartment}`);
    console.log(`📝 Ventas que no son de órdenes:         ${nonOrderSales}`);
    console.log(`❌ Errores:                               ${errors}`);
    console.log('='.repeat(60));

    if (errors === 0 && updated > 0) {
      console.log('\n✨ Corrección completada exitosamente!\n');
      console.log(`🎯 Se agregó el campo "department: banderas" a ${updated} ventas.\n`);
    } else if (updated === 0) {
      console.log('\n✅ No hay ventas que corregir. Todas las ventas de órdenes ya tienen el campo department.\n');
    } else {
      console.log('\n⚠️  Corrección completada con algunos errores. Revisa los logs arriba.\n');
    }

  } catch (error) {
    console.error('\n❌ Error fatal durante la corrección:', error);
    process.exit(1);
  }
}

// Ejecutar la corrección
fixOrderSalesDepartment()
  .then(() => {
    console.log('🏁 Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Error no controlado:', error);
    process.exit(1);
  });
