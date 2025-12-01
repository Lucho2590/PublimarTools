/**
 * Script de migración para agregar el campo 'department' a todas las ventas existentes
 *
 * Este script:
 * - Lee todas las ventas de la colección 'sales'
 * - Agrega el campo 'department' con valor 'banderas' a cada venta que no lo tenga
 * - Muestra el progreso en consola
 *
 * IMPORTANTE: Ejecutar solo UNA VEZ
 *
 * Para ejecutar:
 * npx ts-node scripts/migrateSalesDepartment.ts
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

async function migrateSales() {
  console.log('\n🚀 Iniciando migración de ventas...\n');

  try {
    // Obtener todas las ventas
    const salesSnapshot = await db.collection('sales').get();

    console.log(`📊 Total de ventas encontradas: ${salesSnapshot.size}`);

    if (salesSnapshot.empty) {
      console.log('⚠️  No hay ventas para migrar');
      return;
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Procesar cada venta
    for (const doc of salesSnapshot.docs) {
      const saleData = doc.data();

      // Solo actualizar si no tiene el campo 'department'
      if (!saleData.department) {
        try {
          await doc.ref.update({
            department: 'banderas'
          });
          updated++;
          console.log(`✅ Venta ${doc.id} actualizada (${updated}/${salesSnapshot.size})`);
        } catch (error) {
          errors++;
          console.error(`❌ Error al actualizar venta ${doc.id}:`, error);
        }
      } else {
        skipped++;
        console.log(`⏭️  Venta ${doc.id} ya tiene department: ${saleData.department}`);
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(50));
    console.log('📋 RESUMEN DE MIGRACIÓN');
    console.log('='.repeat(50));
    console.log(`Total de ventas:     ${salesSnapshot.size}`);
    console.log(`✅ Actualizadas:      ${updated}`);
    console.log(`⏭️  Omitidas:         ${skipped}`);
    console.log(`❌ Errores:           ${errors}`);
    console.log('='.repeat(50));

    if (errors === 0) {
      console.log('\n✨ Migración completada exitosamente!\n');
    } else {
      console.log('\n⚠️  Migración completada con algunos errores. Revisa los logs arriba.\n');
    }

  } catch (error) {
    console.error('\n❌ Error fatal durante la migración:', error);
    process.exit(1);
  }
}

// Ejecutar la migración
migrateSales()
  .then(() => {
    console.log('🏁 Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Error no controlado:', error);
    process.exit(1);
  });
