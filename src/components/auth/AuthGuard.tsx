'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

/** Rutas que no piden login (ej. la política de privacidad que exige Meta). */
const PUBLIC_PATHS = ['/privacidad'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Normalizar pathname removiendo barra final
  const normalizedPathname = pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;

  const isLoginPage = normalizedPathname === '/login';
  // Páginas públicas (sin login): se muestran siempre, también al renderizar en
  // el servidor, para que las lean Meta y cualquier visitante.
  const isPublicPage = PUBLIC_PATHS.includes(normalizedPathname);

  useEffect(() => {
    if (isPublicPage) return;
    if (!loading) {
      if (!user && !isLoginPage) {
        // Usuario no autenticado y no está en login -> redirigir a login
        router.replace('/login');
      } else if (user && isLoginPage) {
        // Usuario autenticado y está en login -> redirigir al dashboard
        router.replace('/publimar');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, isLoginPage, isPublicPage]);

  if (isPublicPage) return <>{children}</>;

  // Mostrar loading mientras verifica autenticación
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Si usuario no autenticado y no está en login, no mostrar nada (se está redirigiendo)
  if (!user && !isLoginPage) {
    return null;
  }

  // Si usuario autenticado y está en login, no mostrar nada (se está redirigiendo)
  if (user && isLoginPage) {
    return null;
  }

  return <>{children}</>;
}
