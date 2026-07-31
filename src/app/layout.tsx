import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
// Mono é a face utilitária: rótulos, chaves e contagens — a cara do conteúdo
// deste app (uuids, `campanha-`, "12/29"). Entrou na tela de login.
const geistMono = Geist_Mono({subsets:['latin'],variable:'--font-geist-mono'});

export const metadata: Metadata = {
  title: "Gestão de Clínicas — Contact.IA",
  description: "Carteira de clínicas, funil e performance",
  applicationName: "Clinic Control",
  appleWebApp: {
    capable: true,
    title: "Clinic Control",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      {
        url: "/icon.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark.png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

export const viewport: Viewport = {
  // Habilita env(safe-area-inset-*) para respeitar notch/barras no mobile.
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={cn("dark", "font-sans", geist.variable, geistMono.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster />
        <PwaRegister />
      </body>
    </html>
  );
}
