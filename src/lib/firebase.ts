import { initializeApp, getApps, getApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase - Previene inicialización múltiple y funciona en SSR
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Storage
const storage = getStorage(app);

// Firestore con caché offline persistente (IndexedDB) en el navegador: hidrata
// al instante desde el cache local y sincroniza en segundo plano. En SSR o si ya
// estaba inicializado, cae al getFirestore por defecto.
let firestore: Firestore;
if (typeof window !== "undefined") {
  try {
    firestore = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    firestore = getFirestore(app);
  }
} else {
  firestore = getFirestore(app);
}

// Solo inicializa analytics en el cliente
let analytics: any = null;
if (typeof window !== "undefined") {
  import("firebase/analytics").then(({ getAnalytics }) => {
    analytics = getAnalytics(app);
  });
}

export { app, storage, analytics, firestore };