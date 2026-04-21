"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";

export default function RRHHPage() {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Recursos Humanos</h1>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="py-12 text-center text-slate-600">
          <Users className="h-12 w-12 mx-auto mb-4 text-slate-400" />
          <h2 className="text-xl font-semibold mb-2">Próximamente</h2>
          <p>
            Acá vas a poder administrar empleados, contratos y liquidación de
            sueldos. Mientras tanto, los sueldos se cargan en{" "}
            <Link
              href="/publimar/administracion/gastos-operativos"
              className="text-blue-700 underline"
            >
              Gastos Operativos
            </Link>{" "}
            con la categoría &quot;Sueldos&quot;.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
