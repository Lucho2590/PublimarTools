'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  // Normalizar pathname removiendo barra final
  const normalizedPathname = pathname.endsWith('/') && pathname.length > 1 
    ? pathname.slice(0, -1) 
    : pathname;
  
  const isLoginPage = normalizedPathname === '/login';

  useEffect(() => {
    if (!loading) {
      if (!user && !isLoginPage) {
        // Usuario no autenticado y no está en login -> redirigir a login
        router.push('/login');
      } else if (user && isLoginPage) {
        // Usuario autenticado y está en login -> redirigir al dashboard
        router.push('/publimar');
      }
    }
  }, [user, loading, isLoginPage, router]);

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