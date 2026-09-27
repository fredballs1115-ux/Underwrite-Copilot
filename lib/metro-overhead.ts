import "server-only";
import { usgsAerialUrl } from "@/lib/basemaps";
import { finishAerial } from "@/lib/aerial-finish";
import { frameZoom } from "@/lib/imagery-plan";
import { METRO_FRAME_METRES, metroView } from "@/lib/metro-imagery";

/**
 * A covered market's business district from above — the USGS aerial the
 * public pages fall back to where a market has no photograph — for the
 * metro overhead route and the link preview's card (#436), one fetch for
 * both. Public domain, so it needs no credit beyond the line each surface
 * prints. Null for an unknown market or any failure, never a guess.
 */
export async function fetchMetroOverhead(
  id: string,
  width: number,
  height: number,
): Promise<{ bytes: Buffer; type: string } | null> {
  const view = metroView(id);
  if (!view) return null;
  const url = usgsAerialUrl({
    center: { lat: view.lat, lng: view.lng },
    zoom: frameZoom({
      widthPx: width,
      lat: view.lat,
      precision: "area",
      source: "aerial",
      frameMetres: METRO_FRAME_METRES,
    }),
    width,
    height,
  });

  let img: Response;
  try {
    img = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return null;
  }
  const type = img.headers.get("content-type") ?? "";
  // The ArcGIS export endpoint answers 200 with a JSON error body when it
  // dislikes a request, so content-type is the real success test.
  if (!img.ok || !img.body || !type.startsWith("image/")) return null;

  // The same finish every building's overhead gets (#429); the plain export
  // where the finish fails.
  const raw = Buffer.from(await img.arrayBuffer());
  try {
    return { bytes: await finishAerial(raw), type: "image/jpeg" };
  } catch {
    return { bytes: raw, type };
  }
}
