import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Só no build da imagem Docker (o Dockerfile define DOCKER_BUILD=1): gera
  // .next/standalone com um server.js e o mínimo de node_modules. Condicional
  // de propósito — enquanto a Vercel roda em paralelo, o build dela segue
  // idêntico ao de antes. Ver deploy/README.md.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
};

export default nextConfig;
