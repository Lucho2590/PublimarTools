'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';
import { FirebaseAppProvider, AuthProvider as ReactFireAuthProvider, FirestoreProvider } from 'reactfire';
import { app } from '@/lib/firebase';
import { AuthProvider } from '@/contexts/AuthContext';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export default function Layout({ children }: { children: React.ReactNode }) {
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  return (
    <FirebaseAppProvider firebaseApp={app}>
      <AuthProvider>
        <ReactFireAuthProvider sdk={auth}>
          <FirestoreProvider sdk={firestore}>
            <DashboardLayout>{children}</DashboardLayout>
          </FirestoreProvider>
        </ReactFireAuthProvider>
      </AuthProvider>
    </FirebaseAppProvider>
  );
} 