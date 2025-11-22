import { NextRequest } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Lazy initialization of Firebase Admin
function initializeFirebaseAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
}

export async function verifyAuthToken(request: NextRequest): Promise<{ authenticated: boolean; uid?: string; error?: string }> {
  try {
    initializeFirebaseAdmin();

    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authenticated: false, error: 'Token de autorización no proporcionado' };
    }

    const token = authHeader.split('Bearer ')[1];

    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);

    return { authenticated: true, uid: decodedToken.uid };
  } catch (error) {
    console.error('Error verificando token:', error);
    return { authenticated: false, error: 'Token inválido o expirado' };
  }
}

export function getFirestoreAdmin() {
  initializeFirebaseAdmin();
  return getFirestore();
}
