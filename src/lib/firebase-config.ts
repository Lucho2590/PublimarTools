import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB2KDer0QebLKNQBKL4KG917mcX4iwnU8o",
  authDomain: "publimartools.firebaseapp.com",
  projectId: "publimartools",
  storageBucket: "publimartools.firebasestorage.app",
  messagingSenderId: "202477271278",
  appId: "1:202477271278:web:265e030714badb4fdfdbff",
  measurementId: "G-V7Q3V9VL00",
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Servicios de Firebase
const auth = getAuth(app);
const firestore = getFirestore(app);
const storage = getStorage(app);

// Analytics solo en el cliente
let analytics: any = null;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

// Conectar a emuladores en desarrollo si es necesario
if (
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
) {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(firestore, "localhost", 8080);
  connectStorageEmulator(storage, "localhost", 9199);
}

export { app, auth, firestore, storage, analytics };
