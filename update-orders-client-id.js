// 🔧 SCRIPT PARA COMPLETAR clientId EN ORDERS A PARTIR DEL NOMBRE DEL CLIENTE
// Proceso:
// 1) Lee todos los clientes y construye un mapa nombre-normalizado -> clientId
// 2) Recorre las órdenes sin clientId
// 3) Usa el nombre disponible (clientName / client.name / tempClientData.name) para buscar coincidencias
// 4) Actualiza la orden cuando existe un match único

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function loadServiceAccount() {
  const credentialsPath =
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    throw new Error(
      "Debes definir FIREBASE_SERVICE_ACCOUNT (o GOOGLE_APPLICATION_CREDENTIALS) apuntando al JSON del service account.",
    );
  }

  const resolvedPath = path.isAbsolute(credentialsPath)
    ? credentialsPath
    : path.resolve(process.cwd(), credentialsPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `No se encontró el archivo de credenciales en ${resolvedPath}`,
    );
  }

  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

admin.initializeApp({
  credential: admin.credential.cert(loadServiceAccount()),
});

const db = admin.firestore();

const normalize = (value) => {
  if (!value || typeof value !== "string") return null;
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // elimina tildes
    .trim()
    .toLowerCase();
};

const buildClientMap = async () => {
  console.log("📋 Construyendo mapa de clientes...");
  const snapshot = await db.collection("clients").get();

  if (snapshot.empty) {
    console.log("⚠️  No se encontraron clientes en la colección.");
    return {};
  }

  const nameMap = new Map();
  const duplicates = new Map();

  snapshot.forEach((doc) => {
    const data = doc.data();
    const possibleNames = [
      data.name,
      data.businessName,
      data.clientName,
      data.reference,
    ]
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => normalize(value))
      .filter(Boolean);

    possibleNames.forEach((normalized) => {
      if (!nameMap.has(normalized)) {
        nameMap.set(normalized, doc.id);
      } else if (nameMap.get(normalized) !== doc.id) {
        if (!duplicates.has(normalized)) {
          duplicates.set(normalized, new Set([nameMap.get(normalized)]));
        }
        duplicates.get(normalized).add(doc.id);
      }
    });
  });

  if (duplicates.size > 0) {
    console.log(
      `⚠️  Se detectaron ${duplicates.size} nombres duplicados. No se actualizarán automáticamente esos registros.\n`,
    );
  }

  return { nameMap, duplicates };
};

const resolveOrderName = (order) => {
  const candidates = [
    order.clientName,
    order.client?.name,
    order.tempClientData?.name,
  ];

  for (const candidate of candidates) {
    const normalized = normalize(candidate);
    if (normalized) {
      return { normalized, original: candidate };
    }
  }

  return { normalized: null, original: null };
};

async function updateOrdersClientId() {
  try {
    const { nameMap, duplicates } = await buildClientMap();

    console.log("📦 Buscando órdenes sin clientId...");
    const ordersSnapshot = await db.collection("orders").get();

    if (ordersSnapshot.empty) {
      console.log("✅ No hay órdenes en la colección.");
      return;
    }

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let withoutMatch = 0;
    let duplicateMatches = 0;

    for (const doc of ordersSnapshot.docs) {
      const data = doc.data();
      processed++;

      if (data.clientId) {
        continue;
      }

      const { normalized, original } = resolveOrderName(data);

      if (!normalized) {
        skipped++;
        console.log(
          `⏭️  Orden ${doc.id} sin nombre disponible (clientName/client/tempClientData).`,
        );
        continue;
      }

      if (duplicates.has(normalized)) {
        duplicateMatches++;
        console.log(
          `⚠️  Orden ${doc.id} (${original}) coincide con múltiples clientes (${[
            ...duplicates.get(normalized),
          ].join(", ")}). Revisar manualmente.`,
        );
        continue;
      }

      const clientId = nameMap.get(normalized);

      if (!clientId) {
        withoutMatch++;
        console.log(
          `❓ Orden ${doc.id} (${original}) no encontró coincidencia en clients.`,
        );
        continue;
      }

      await db.collection("orders").doc(doc.id).update({
        clientId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      updated++;
      console.log(
        `✅ Orden ${doc.id} (${original}) actualizada con clientId ${clientId}`,
      );
    }

    console.log("\n🎯 Resumen:");
    console.log(`   • Órdenes procesadas: ${processed}`);
    console.log(`   • Órdenes actualizadas: ${updated}`);
    console.log(`   • Órdenes sin nombre: ${skipped}`);
    console.log(`   • Sin coincidencia: ${withoutMatch}`);
    console.log(`   • Coincidencias duplicadas: ${duplicateMatches}`);
  } catch (error) {
    console.error("💥 Error durante la actualización:", error);
  } finally {
    process.exit(0);
  }
}

updateOrdersClientId();

