import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Punto de Venta · PublimarTools",
  description: "Punto de venta",
};

export default function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-screen flex flex-col bg-gray-50">{children}</div>;
}
