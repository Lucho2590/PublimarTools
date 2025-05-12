"use client";

import { FirebaseAppProvider, AuthProvider, FirestoreProvider } from "reactfire";
import { firebaseConfig } from "~/lib/firebase";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const auth = getAuth();
  const firestore = getFirestore();

  return (
    <FirebaseAppProvider firebaseConfig={firebaseConfig}>
      <AuthProvider sdk={auth}>
        <FirestoreProvider sdk={firestore}>
          {children}
        </FirestoreProvider>
      </AuthProvider>
    </FirebaseAppProvider>
  );
} 