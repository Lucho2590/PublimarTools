'use client';

import { FirebaseAppProvider } from "reactfire";
import { app } from "@/lib/firebase";
import { AuthProvider } from "@/contexts/AuthContext";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FirebaseAppProvider firebaseApp={app}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </FirebaseAppProvider>
  );
} 