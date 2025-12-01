'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ExhibicionesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Exhibiciones</h1>

      <Card>
        <CardHeader>
          <CardTitle>Exhibiciones de Vía Pública</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500">
            Sección en desarrollo. Aquí se gestionarán las exhibiciones activas de Vía Pública.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
