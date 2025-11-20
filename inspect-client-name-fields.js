// 🔍 SCRIPT PARA IDENTIFICAR CAMPOS DE NOMBRE DE CLIENTE EN ORDERS, SALES Y QUOTES
// Recorre las colecciones indicadas y lista todas las variantes encontradas para el nombre del cliente

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

const collectionsToInspect = ["orders", "sales", "quotes"];
const clientKeywords = ["client", "cliente", "customer"];
const nameKeywords = ["name", "nombre"];

const results = collectionsToInspect.reduce((acc, collection) => {
  acc[collection] = new Map();
  return acc;
}, {});

const hasKeyword = (text = "", keywords = []) => {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
};

const shouldCapturePath = (pathSegments, value) => {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  const lowerSegments = pathSegments.map((segment) => segment.toLowerCase());
  const lastSegment = lowerSegments[lowerSegments.length - 1] || "";
  const parentSegments = lowerSegments.slice(0, -1);

  const keyHasClient = hasKeyword(lastSegment, clientKeywords);
  const keyHasName = hasKeyword(lastSegment, nameKeywords);
  const parentHasClient = parentSegments.some((segment) =>
    hasKeyword(segment, clientKeywords),
  );

  return (
    keyHasClient ||
    (parentHasClient && keyHasName) ||
    (keyHasClient && keyHasName)
  );
};

const registerMatch = (collection, pathSegments, value, docId) => {
  const path = pathSegments.join(".");
  const collectionResults = results[collection];

  if (!collectionResults.has(path)) {
    collectionResults.set(path, {
      occurrences: 0,
      docs: new Set(),
      examples: new Set(),
    });
  }

  const entry = collectionResults.get(path);
  entry.occurrences += 1;
  entry.docs.add(docId);

  if (entry.examples.size < 5) {
    entry.examples.add(value.trim().slice(0, 80));
  }
};

const visitedObjects = new WeakSet();

const normalizeValue = (value) => {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof admin.firestore.DocumentReference) {
    return value.path;
  }
  if (
    value &&
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    try {
      return value.toDate().toISOString();
    } catch {
      return String(value);
    }
  }
  return value;
};

const traverseData = (collection, rawValue, pathSegments, docId) => {
  const value = normalizeValue(rawValue);

  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      traverseData(collection, item, [...pathSegments, `[${index}]`], docId),
    );
    return;
  }

  if (typeof value === "object") {
    if (visitedObjects.has(value)) {
      return;
    }
    visitedObjects.add(value);

    Object.entries(value).forEach(([key, nestedValue]) => {
      traverseData(collection, nestedValue, [...pathSegments, key], docId);
    });

    visitedObjects.delete(value);
    return;
  }

  if (shouldCapturePath(pathSegments, value)) {
    registerMatch(collection, pathSegments, value, docId);
  }
};

async function inspectCollections() {
  console.log("🔍 Analizando campos de nombre de cliente en Firestore...\n");

  for (const collection of collectionsToInspect) {
    console.log(`📂 Colección: ${collection}`);

    const snapshot = await db.collection(collection).get();

    if (snapshot.empty) {
      console.log("   ⚠️  No hay documentos en esta colección.\n");
      continue;
    }

    snapshot.forEach((doc) => {
      traverseData(collection, doc.data(), [], doc.id);
    });

    const collectionResults = results[collection];

    if (collectionResults.size === 0) {
      console.log("   ✅ No se encontraron campos relacionados con clientes.\n");
      continue;
    }

    collectionResults.forEach((entry, path) => {
      console.log(`   • Campo: ${path}`);
      console.log(`     - Ocurrencias: ${entry.occurrences}`);
      console.log(`     - Documentos únicos: ${entry.docs.size}`);
      console.log(
        `     - Ejemplos: ${Array.from(entry.examples).join(" | ") || "—"}`,
      );
    });

    console.log("");
  }

  console.log("✅ Análisis finalizado.");
  process.exit(0);
}

inspectCollections().catch((error) => {
  console.error("💥 Error durante el análisis:", error);
  process.exit(1);
});

