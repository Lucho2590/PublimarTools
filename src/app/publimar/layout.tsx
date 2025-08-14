'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';
import { FirebaseAppProvider, AuthProvider as ReactFireAuthProvider, FirestoreProvider } from 'reactfire';
import { app } from '@/lib/firebase';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export default function Layout({ children }: { children: React.ReactNode }) {
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  return (
    <FirebaseAppProvider firebaseApp={app}>
      <ReactFireAuthProvider sdk={auth}>
        <FirestoreProvider sdk={firestore}>
          <DashboardLayout>{children}</DashboardLayout>
        </FirestoreProvider>
      </ReactFireAuthProvider>
    </FirebaseAppProvider>
  );
} 