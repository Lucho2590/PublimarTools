'use client';

import { FirebaseAppProvider, AuthProvider as ReactFireAuthProvider, FirestoreProvider } from "reactfire";
import { app } from "@/lib/firebase";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthGuard from "@/components/auth/AuthGuard";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  return (
    <FirebaseAppProvider firebaseApp={app}>
      <AuthProvider>
        <ReactFireAuthProvider sdk={auth}>
          <FirestoreProvider sdk={firestore}>
            <AuthGuard>
              {children}
            </AuthGuard>
          </FirestoreProvider>
        </ReactFireAuthProvider>
      </AuthProvider>
    </FirebaseAppProvider>
  );
} 