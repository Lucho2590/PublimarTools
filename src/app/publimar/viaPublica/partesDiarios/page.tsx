'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PartesDiariosPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Partes Diarios</h1>

      <Card>
        <CardHeader>
          <CardTitle>Partes Diarios de Vía Pública</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500">
            Sección en desarrollo. Aquí se registrarán los partes diarios de las actividades de Vía Pública.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
