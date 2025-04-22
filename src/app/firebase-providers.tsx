"use client";

import { ReactNode } from "react";
import {
  FirebaseAppProvider,
  AuthProvider,
  FirestoreProvider,
  StorageProvider,
  useFirebaseApp,
} from "reactfire";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB2KDer0QebLKNQBKL4KG917mcX4iwnU8o",
  authDomain: "publimartools.firebaseapp.com",
  projectId: "publimartools",
  storageBucket: "publimartools.firebasestorage.app",
  messagingSenderId: "202477271278",
  appId: "1:202477271278:web:265e030714badb4fdfdbff",
  measurementId: "G-V7Q3V9VL00",
};

interface IFirebaseComponentsProps {
  children: ReactNode;
}

// Este componente proporciona los servicios de Firebase
function FirebaseComponents({ children }: IFirebaseComponentsProps) {
  const app = useFirebaseApp();
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const storage = getStorage(app);

  return (
    <AuthProvider sdk={auth}>
      <FirestoreProvider sdk={firestore}>
        <StorageProvider sdk={storage}>{children}</StorageProvider>
      </FirestoreProvider>
    </AuthProvider>
  );
}

// Componente principal que incluye todos los proveedores
export default function FirebaseProviders({
  children,
}: IFirebaseComponentsProps) {
  return (
    <FirebaseAppProvider firebaseConfig={firebaseConfig}>
      <FirebaseComponents>{children}</FirebaseComponents>
    </FirebaseAppProvider>
  );
}
