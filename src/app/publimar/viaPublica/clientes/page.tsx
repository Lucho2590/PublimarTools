'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ClientesViaPublicaPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Clientes - Vía Pública</h1>

      <Card>
        <CardHeader>
          <CardTitle>Clientes de Vía Pública</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500">
            Sección en desarrollo. Aquí se gestionarán los clientes de Vía Pública.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
