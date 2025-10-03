import { Inter } from "next/font/google";
import "./globals.css";
import { Metadata } from "next";
import ClientProviders from "./ClientProviders";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PublimarTools",
  description: "Sistema de gestión para Publimar",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className + " overflow-hidden"}>
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
} 