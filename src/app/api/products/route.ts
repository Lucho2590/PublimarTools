import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, getFirestoreAdmin } from '@/lib/apiAuth';
import collections from '@/lib/collections';

export const dynamic = 'force-dynamic';

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
    const db = getFirestoreAdmin();
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
        ecommerce: data.ecommerce || false,
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
