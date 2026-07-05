import { Metadata } from "next";
import RegisterSW from "./RegisterSW";

export const metadata: Metadata = {
  title: "Punto de Venta · PublimarTools",
  description: "Punto de venta",
  manifest: "/pos.webmanifest",
  themeColor: "#2b3a8f",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "POS",
  },
};

export default function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <RegisterSW />
      {children}
    </div>
  );
}
