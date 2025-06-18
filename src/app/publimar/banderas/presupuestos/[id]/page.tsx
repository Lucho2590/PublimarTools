'use client';

import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function PresupuestoPage() {
  const params = useParams();
  const router = useRouter();

  return (
    <div>
      <div className="flex items-center mb-6">
        <Button
          variant="outline"
          onClick={() => router.push('/publimar/banderas/presupuestos')}
          className="bg-blue-900 hover:bg-blue-600 hover:text-white text-white mr-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver
        </Button>
        <h1 className="text-2xl font-bold">Presupuesto #{params.id}</h1>
      </div>
      
      <div className="text-center py-12">
        <p className="text-gray-500">Página de presupuestos en desarrollo</p>
      </div>
    </div>
  );
}
