import type { MetadataRoute } from "next";

// Manifest do PWA — permite "adicionar à tela inicial" e abrir em modo app
// (standalone), a um toque. Next serve isto em /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clinic Control — Contact.IA",
    short_name: "Clinic Control",
    description: "Carteira de clínicas, funil e performance",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
