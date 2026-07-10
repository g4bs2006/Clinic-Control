"use client";

import { useEffect } from "react";

/** Registra o service worker (necessário para o PWA ser instalável). */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* falha no registro não deve quebrar o app */
      });
    }
  }, []);
  return null;
}
