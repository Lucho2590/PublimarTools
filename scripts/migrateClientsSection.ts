/**
 * Script de migración para agregar el campo 'section' a todos los clientes existentes
 *
 * Este script:
 * - Lee todos los clientes de la colección 'clients'
 * - Agrega el campo 'section' con valor 'banderas' a cada cliente que no lo tenga
 * - Muestra el progreso en consola
 *
 * IMPORTANTE: Ejecutar solo UNA VEZ
 *
 * Para ejecutar:
 * npx ts-node scripts/migrateClientsSection.ts
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

async function migrateClients() {
  console.log('\n🚀 Iniciando migración de clientes...\n');

  try {
    // Obtener todos los clientes
    const clientsSnapshot = await db.collection('clients').get();

    console.log(`📊 Total de clientes encontrados: ${clientsSnapshot.size}`);

    if (clientsSnapshot.empty) {
      console.log('⚠️  No hay clientes para migrar');
      return;
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Procesar cada cliente
    for (const doc of clientsSnapshot.docs) {
      const clientData = doc.data();

      // Solo actualizar si no tiene el campo 'section'
      if (!clientData.section) {
        try {
          await doc.ref.update({
            section: 'banderas'
          });
          updated++;
          console.log(`✅ Cliente ${doc.id} (${clientData.name}) actualizado (${updated}/${clientsSnapshot.size})`);
        } catch (error) {
          errors++;
          console.error(`❌ Error al actualizar cliente ${doc.id}:`, error);
        }
      } else {
        skipped++;
        console.log(`⏭️  Cliente ${doc.id} (${clientData.name}) ya tiene section: ${clientData.section}`);
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(50));
    console.log('📋 RESUMEN DE MIGRACIÓN');
    console.log('='.repeat(50));
    console.log(`Total de clientes:   ${clientsSnapshot.size}`);
    console.log(`✅ Actualizados:      ${updated}`);
    console.log(`⏭️  Omitidos:         ${skipped}`);
    console.log(`❌ Errores:           ${errors}`);
    console.log('='.repeat(50));

    if (errors === 0) {
      console.log('\n✨ Migración completada exitosamente!');
      console.log('   Todos los clientes ahora tienen section: "banderas"\n');
    } else {
      console.log('\n⚠️  Migración completada con algunos errores. Revisa los logs arriba.\n');
    }

  } catch (error) {
    console.error('\n❌ Error fatal durante la migración:', error);
    process.exit(1);
  }
}

// Ejecutar la migración
migrateClients()
  .then(() => {
    console.log('🏁 Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Error no controlado:', error);
    process.exit(1);
  });
