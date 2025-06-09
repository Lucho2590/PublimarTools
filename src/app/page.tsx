'use client';

import { useAuth } from '@/contexts/AuthContext';
import { redirect, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user && !loading) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <p>Cargando...</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return redirect(`/publimar`);
  //   <main className="flex min-h-screen flex-col items-center justify-center p-24">
  //     <h1 className="text-2xl font-bold mb-4">¡Bienvenido, {user.email}!</h1>
  //     <button
  //       onClick={() => logout()}
  //       className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
  //     >
  //       Cerrar Sesión
  //     </button>
  //   </main>
  // );
}
