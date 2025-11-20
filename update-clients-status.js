// 🔥 SCRIPT DE ACTUALIZACIÓN DE STATUS EN CLIENTES
// Este script recorre todos los clientes y agrega status="active" a quienes no lo tengan

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function loadServiceAccount() {
  const credentialsPath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    throw new Error('Debes definir la variable FIREBASE_SERVICE_ACCOUNT (o GOOGLE_APPLICATION_CREDENTIALS) apuntando al JSON del service account.');
  }

  const resolvedPath = path.isAbsolute(credentialsPath)
    ? credentialsPath
    : path.resolve(process.cwd(), credentialsPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`No se encontró el archivo de credenciales en ${resolvedPath}`);
  }

  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

admin.initializeApp({
  credential: admin.credential.cert(loadServiceAccount())
});

const db = admin.firestore();

async function updateClientsStatus() {
  console.log('🚀 Iniciando actualización de status en clientes...');
  console.log('📋 Buscando clientes sin el campo "status" o con status vacío/null...\n');
  
  try {
    // 1. Obtener todos los clientes
    console.log('📊 Leyendo todos los clientes...');
    const clientsSnapshot = await db.collection('clients').get();
    
    if (clientsSnapshot.empty) {
      console.log('⚠️  No se encontraron clientes en la base de datos');
      return;
    }

    console.log(`📈 Se encontraron ${clientsSnapshot.size} clientes\n`);

    // 2. Procesar cada cliente
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const clientsToUpdate = [];

    clientsSnapshot.forEach(doc => {
      const client = doc.data();
      const clientId = doc.id;
      
      // Verificar si el cliente NO tiene el campo status o es null/undefined/vacío
      if (!client.status || client.status === null || client.status === undefined || client.status === '') {
        clientsToUpdate.push({
          id: clientId,
          name: client.name || 'Sin nombre',
          currentStatus: client.status || '(no definido)'
        });
      } else {
        skippedCount++;
        console.log(`⏭️  Cliente "${client.name || clientId}" ya tiene status: "${client.status}"`);
      }
    });

    console.log(`\n📊 Resumen de análisis:`);
    console.log(`   - Clientes que necesitan actualización: ${clientsToUpdate.length}`);
    console.log(`   - Clientes que ya tienen status: ${skippedCount}\n`);

    if (clientsToUpdate.length === 0) {
      console.log('✅ ¡Todos los clientes ya tienen el campo status definido!');
      return;
    }

    // 3. Actualizar cada cliente que necesita el campo status
    console.log('🔄 Actualizando clientes en la base de datos...\n');
    
    for (const client of clientsToUpdate) {
      try {
        await db.collection('clients').doc(client.id).update({
          status: 'active',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        updatedCount++;
        console.log(`✅ Cliente "${client.name}" (ID: ${client.id}) - Status agregado: "active"`);
        
      } catch (error) {
        console.error(`❌ Error actualizando cliente ${client.id} ("${client.name}"):`, error.message);
        errorCount++;
      }
    }

    console.log('\n🎉 ¡Actualización completada!');
    console.log(`✅ Clientes actualizados: ${updatedCount}`);
    console.log(`⏭️  Clientes ya con status: ${skippedCount}`);
    console.log(`❌ Errores: ${errorCount}`);
    console.log(`📊 Total de clientes procesados: ${clientsSnapshot.size}`);

  } catch (error) {
    console.error('💥 Error durante la actualización:', error);
    throw error;
  } finally {
    // Cerrar la conexión
    process.exit(0);
  }
}

// Ejecutar el script
updateClientsStatus();

