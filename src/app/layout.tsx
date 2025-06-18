'use client';

import { Inter } from "next/font/google";
import Head from "next/head";
import "./globals.css";
import { FirebaseAppProvider } from "reactfire";
import { app } from "@/lib/firebase";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <Head>
        <title>PublimarTools</title>
        <meta name="description" content="Sistema de gestión para Publimar" />
      </Head>
      <body className={inter.className}>
        <FirebaseAppProvider firebaseApp={app}>
          <AuthProvider>
            {children}
          </AuthProvider>
        </FirebaseAppProvider>
      </body>
    </html>
  );
} 