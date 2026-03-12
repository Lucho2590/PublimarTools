"use client";

import { useState, useEffect } from "react";
import { useFirestore } from "reactfire";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Database,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface CollectionStats {
  name: string;
  count: number;
  lastUpdated: Date | null;
  sample: any[];
  error?: string;
}

const COLLECTIONS_TO_CHECK = [
  "productAnalytics",
  "productViewEvents",
  "searchQueries",
  "conversionFunnels",
  "abandonedCarts",
  "orders",
];

export default function AnalyticsDebugPage() {
  const firestore = useFirestore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CollectionStats[]>([]);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const checkCollections = async () => {
    setLoading(true);
    const results: CollectionStats[] = [];

    for (const collName of COLLECTIONS_TO_CHECK) {
      try {
        const q = query(
          collection(firestore, collName),
          limit(5)
        );
        const snapshot = await getDocs(q);

        const sample = snapshot.docs.map((doc) => {
          const data = doc.data();
          // Convertir Timestamps a strings legibles
          const processedData: any = { id: doc.id };
          for (const [key, value] of Object.entries(data)) {
            if (value instanceof Timestamp) {
              processedData[key] = value.toDate().toLocaleString("es-AR");
            } else if (typeof value === "object" && value !== null) {
              processedData[key] = JSON.stringify(value).substring(0, 50) + "...";
            } else {
              processedData[key] = value;
            }
          }
          return processedData;
        });

        // Obtener count total
        const allDocs = await getDocs(collection(firestore, collName));

        results.push({
          name: collName,
          count: allDocs.size,
          lastUpdated: sample.length > 0 ? new Date() : null,
          sample,
        });
      } catch (error: any) {
        results.push({
          name: collName,
          count: 0,
          lastUpdated: null,
          sample: [],
          error: error.message,
        });
      }
    }

    setStats(results);
    setLastCheck(new Date());
    setLoading(false);
  };

  useEffect(() => {
    checkCollections();
  }, []);

  const totalDocuments = stats.reduce((acc, s) => acc + s.count, 0);
  const collectionsWithData = stats.filter((s) => s.count > 0).length;
  const collectionsWithErrors = stats.filter((s) => s.error).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Database className="h-8 w-8" />
            Debug Analytics Data
          </h1>
          <p className="text-muted-foreground">
            Verificación de datos en Firestore para analytics
          </p>
        </div>
        <Button onClick={checkCollections} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Documentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalDocuments}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Colecciones con Datos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {collectionsWithData} / {COLLECTIONS_TO_CHECK.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Errores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${collectionsWithErrors > 0 ? "text-red-600" : "text-green-600"}`}>
              {collectionsWithErrors}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Última Verificación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {lastCheck ? lastCheck.toLocaleTimeString("es-AR") : "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detalle por colección */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Detalle por Colección</h2>

        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {stat.error ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : stat.count > 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                )}
                {stat.name}
                <span className="ml-auto text-sm font-normal text-muted-foreground">
                  {stat.count} documentos
                </span>
              </CardTitle>
              {stat.error && (
                <CardDescription className="text-red-600">
                  Error: {stat.error}
                </CardDescription>
              )}
            </CardHeader>
            {stat.sample.length > 0 && (
              <CardContent>
                <div className="text-sm font-medium mb-2">Muestra (últimos 5):</div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(stat.sample[0] || {}).slice(0, 6).map((key) => (
                          <TableHead key={key} className="text-xs">
                            {key}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stat.sample.map((item, idx) => (
                        <TableRow key={idx}>
                          {Object.values(item).slice(0, 6).map((value: any, vidx) => (
                            <TableCell key={vidx} className="text-xs max-w-[200px] truncate">
                              {String(value)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Info de configuración */}
      <Card>
        <CardHeader>
          <CardTitle>Configuración Firebase</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Project ID:</span>
              <span className="ml-2 font-mono bg-gray-100 px-2 py-1 rounded">publimartools</span>
            </div>
            <div>
              <span className="font-medium">GA4 ID (BanderasMDP):</span>
              <span className="ml-2 font-mono bg-gray-100 px-2 py-1 rounded">G-C68NCKXTEG</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
