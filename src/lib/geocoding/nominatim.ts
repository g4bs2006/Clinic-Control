export async function geocodeAddress(
  query: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3500,
): Promise<{ lat: number; lng: number } | null> {
  if (!query.trim()) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  // Bound the request so a slow/unresponsive Nominatim never hangs the save.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "gestao-clinicas/1.0 (contact.ia)" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    // Timeout/network error → skip geocoding; the clinic still saves.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
