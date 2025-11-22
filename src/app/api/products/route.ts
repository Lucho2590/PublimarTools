import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/apiAuth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import collections from '@/lib/collections';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticación
    const authResult = await verifyAuthToken(request);

    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: authResult.error || 'No autorizado' },
        { status: 401 }
      );
    }

    // Obtener todos los productos de Firestore
    const db = getFirestore();
    const productsSnapshot = await db.collection(collections.PRODUCTS).get();

    const products = productsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        description: data.description,
        sku: data.sku,
        categories: data.categories || [],
        lowStock: data.lowStock || false,
        variants: data.variants || [],
        imageUrls: data.imageUrls || [],
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
