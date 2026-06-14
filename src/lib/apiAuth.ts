import { NextRequest } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Normaliza el private key sin importar cómo se haya pegado en el env:
 * - recorta espacios,
 * - saca comillas envolventes (" o '),
 * - convierte `\n` escapados en saltos de línea reales.
 * Si ya viene con saltos reales, queda igual.
 */
function normalizePrivateKey(raw?: string): string | undefined {
  // Preferencia: FIREBASE_PRIVATE_KEY_BASE64 (a prueba de problemas de pegado).
  const b64 = process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim();
  if (b64) {
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  if (!raw) return undefined;
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n');
}

// Lazy initialization of Firebase Admin
function initializeFirebaseAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL?.trim(),
        privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
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
