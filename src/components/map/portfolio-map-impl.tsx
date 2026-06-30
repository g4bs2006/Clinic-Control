"use client"

import "leaflet/dist/leaflet.css"
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet"

export interface MapPoint {
  clinicId: string
  name: string
  city: string | null
  state: string | null
  rate: number // fração 0..1
  status: string | null
  statusColor: string | null
  leads: number
  lat: number
  lng: number
}

interface PortfolioMapImplProps {
  points: MapPoint[]
}

const FALLBACK_COLOR = "#64748b"

// Brazil centroid + a zoom that frames the country
const BRAZIL_CENTER: [number, number] = [-14.235, -51.925]
const DEFAULT_ZOOM = 4

function fmtPct(rate: number): string {
  return (
    (rate * 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + "%"
  )
}

// Slightly scale the dot by lead volume so busy clinics read as larger points,
// clamped so the map never turns into a few giant blobs.
function radiusFor(leads: number): number {
  const r = 6 + Math.sqrt(Math.max(0, leads)) * 0.6
  return Math.min(16, Math.max(6, r))
}

export default function PortfolioMapImpl({ points }: PortfolioMapImplProps) {
  return (
    <MapContainer
      center={BRAZIL_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      style={{ height: "520px", width: "100%", background: "oklch(0.18 0.03 240)" }}
    >
      <TileLayer
        // CARTO dark_matter — tiles dark gratuitos, sem chave de API
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      {points.map((p) => {
        const color = p.statusColor ?? FALLBACK_COLOR
        return (
          <CircleMarker
            key={p.clinicId}
            center={[p.lat, p.lng]}
            radius={radiusFor(p.leads)}
            pathOptions={{
              color,
              weight: 1.5,
              fillColor: color,
              fillOpacity: 0.75,
            }}
          >
            <Popup>
              <div style={{ minWidth: "9rem", lineHeight: 1.4 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
                {(p.city || p.state) && (
                  <div style={{ fontSize: "0.75rem", color: "#475569" }}>
                    {[p.city, p.state].filter(Boolean).join("/")}
                  </div>
                )}
                <div style={{ fontSize: "0.8rem", marginTop: 4 }}>
                  Taxa: <strong>{fmtPct(p.rate)}</strong>
                </div>
                {p.status && (
                  <div
                    style={{
                      display: "inline-block",
                      marginTop: 4,
                      padding: "1px 8px",
                      borderRadius: 9999,
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      background: color,
                      color: "#fff",
                    }}
                  >
                    {p.status}
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
