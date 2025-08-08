'use client';

import { FirebaseAppProvider } from "reactfire";
import { app } from "@/lib/firebase";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthGuard from "@/components/auth/AuthGuard";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FirebaseAppProvider firebaseApp={app}>
      <AuthProvider>
        <AuthGuard>
          {children}
        </AuthGuard>
      </AuthProvider>
    </FirebaseAppProvider>
  );
} 