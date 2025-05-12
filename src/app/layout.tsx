import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { FirebaseProvider } from "~/providers/firebase-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PublimarTools",
  description: "Sistema de control de stock para banderas",
  icons: {
    icon: "/icon.svg",
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <FirebaseProvider>{children}</FirebaseProvider>
      </body>
    </html>
  );
}
