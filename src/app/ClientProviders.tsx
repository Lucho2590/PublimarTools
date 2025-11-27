'use client';

import { FirebaseAppProvider, AuthProvider as ReactFireAuthProvider, FirestoreProvider } from "reactfire";
import { app } from "@/lib/firebase";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { AuthProviderWithFirestore } from "@/contexts/AuthContext";
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
      <ReactFireAuthProvider sdk={auth}>
        <FirestoreProvider sdk={firestore}>
          <AuthProviderWithFirestore>
            <AuthGuard>
              {children}
            </AuthGuard>
          </AuthProviderWithFirestore>
        </FirestoreProvider>
      </ReactFireAuthProvider>
    </FirebaseAppProvider>
  );
} 