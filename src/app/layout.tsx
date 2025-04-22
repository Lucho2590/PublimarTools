import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "~/components/ui/sonner";
import FirebaseProviders from "./firebase-providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Publimar Tools - Control de Stock y Presupuestos",
  description:
    "Sistema de gestión de stock, presupuestos y pedidos para Publimar",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <FirebaseProviders>
          {children}
          <Toaster />
        </FirebaseProviders>
      </body>
    </html>
  );
}
