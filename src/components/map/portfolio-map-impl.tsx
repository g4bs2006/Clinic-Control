"use client"

import "leaflet/dist/leaflet.css"
import { useEffect } from "react"
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet"

export interface MapPoint {
  clinicId: string
  name: string
  city: string | null
  state: string | null
  rate: number // fração 0..1
  status: string | null
  statusColor: string | null
  leads: number
  scheduled: number
  mode: "auto" | "manual"
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

// Auto-frame the map to the clinics with coordinates (instead of a fixed view).
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 11)
      return
    }
    map.fitBounds(
      points.map((p) => [p.lat, p.lng] as [number, number]),
      { padding: [48, 48], maxZoom: 12 },
    )
  }, [points, map])
  return null
}

export default function PortfolioMapImpl({ points }: PortfolioMapImplProps) {
  return (
    <MapContainer
      center={BRAZIL_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      style={{ height: "520px", width: "100%", background: "oklch(0.145 0 0)" }}
    >
      <TileLayer
        // CARTO dark_matter — tiles dark gratuitos, sem chave de API
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <FitBounds points={points} />
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
            <Tooltip direction="top" offset={[0, -2]}>
              {p.name}
            </Tooltip>
            <Popup>
              <div style={{ minWidth: "11rem", lineHeight: 1.45 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontSize: "0.72rem", color: "#475569" }}>
                  {[p.city, p.state].filter(Boolean).join("/") || "Sem localização"}
                  {" · "}
                  {p.mode === "auto" ? "Automática" : "Manual"}
                </div>

                {p.status && (
                  <div
                    style={{
                      display: "inline-block",
                      margin: "6px 0 4px",
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

                {/* Métricas */}
                <table style={{ width: "100%", fontSize: "0.75rem", marginTop: 2 }}>
                  <tbody>
                    <tr>
                      <td style={{ color: "#64748b" }}>Leads</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {p.leads.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: "#64748b" }}>Agendados</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {p.scheduled.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: "#64748b" }}>Taxa</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>
                        {fmtPct(p.rate)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <a
                  href={`/clinicas/${p.clinicId}`}
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#2563eb",
                    textDecoration: "none",
                  }}
                >
                  Ver detalhe →
                </a>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
