'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/permissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function RoleGuard({ children }: { children: React.ReactNode }) {
  const { userRole, userData, loadingUserData, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const normalizedPathname = pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;

  // Esperar a que carguen los datos del usuario antes de evaluar
  if (!user || loadingUserData) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (canAccessRoute(userRole, normalizedPathname, userData?.permissions)) {
    return <>{children}</>;
  }

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/publimar');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl">
      <Card className="max-w-md w-full border border-gray-200 shadow-lg overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-red-500 to-orange-500" />
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center bg-red-100">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">
            No autorizado
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            No tenés permisos para acceder a esta sección. Si creés que es un error,
            contactá al administrador.
          </p>
          <Button
            onClick={handleBack}
            size="lg"
            className="w-full font-medium bg-blue-600 hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
