"use client"

import dynamic from "next/dynamic"
import type { MapPoint } from "./portfolio-map-impl"

// Leaflet touches `window` on import → load the map only on the client.
const PortfolioMapImpl = dynamic(() => import("./portfolio-map-impl"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "520px",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "oklch(0.64 0 0)",
        fontSize: "0.8rem",
        background: "oklch(0.145 0 0)",
        borderRadius: "0.5rem",
      }}
    >
      Carregando mapa…
    </div>
  ),
})

export type { MapPoint }

export function PortfolioMap({ points }: { points: MapPoint[] }) {
  return (
    <div style={{ overflow: "hidden", borderRadius: "0.5rem" }}>
      <PortfolioMapImpl points={points} />
    </div>
  )
}
