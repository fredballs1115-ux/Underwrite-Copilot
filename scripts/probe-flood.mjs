#!/usr/bin/env node
// FEMA's flood map over the USGS aerial, rendered where the network is open
// and saved as pictures to be judged by eye.
//
//   node scripts/probe-flood.mjs --out=sheet [--points="lat,lng,label;…"] [--zooms=17,19]
//
// WHY. The deal page's Flood tab draws FEMA's National Flood Hazard Layer —
// the flood insurance rate maps as a map service — over the same aerial
// frame the Aerial tab shows, and the sandbox that builds it cannot reach
// hazards.fema.gov or the National Map. Which layer is the zones, what FEMA's
// own legend calls each colour, whether the export answers a transparent PNG
// for a bbox, and whether the two frames actually line up are claims until
// a runner prints them — and the last one is a picture, so this saves the
// composites, and `skyline-sheet.yml`'s flood mode pushes them to their own
// branch (`flood-sheet`) for the sandbox to fetch and look at.
//
// The bbox is the one lib/basemaps' `mercatorBbox` draws (a test holds this
// copy to it): the overlay is useful only if it lies over the aerial pixel
// for pixel.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const NFHL_ROOT =
  process.env.NFHL_SERVICE_ROOT ?? "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const USGS_IMAGERY = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer";

const EARTH_R = 6378137;
const RES_Z0 = (2 * Math.PI * EARTH_R) / 256;
const MAX_MERCATOR_LAT = 85.05112878;

/** lib/basemaps' Web-Mercator bbox, restated for plain Node. */
export function bboxFor(lat, lng, zoom, width, height) {
  const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  const x = EARTH_R * ((lng * Math.PI) / 180);
  const y = EARTH_R * Math.log(Math.tan(Math.PI / 4 + rad / 2));
  const res = RES_Z0 / 2 ** zoom;
  const halfW = (width * res) / 2;
  const halfH = (height * res) / 2;
  return { minX: x - halfW, minY: y - halfH, maxX: x + halfW, maxY: y + halfH };
}

const bboxParam = (b) => [b.minX, b.minY, b.maxX, b.maxY].map((n) => n.toFixed(3)).join(",");

export function aerialUrl(b, width, height) {
  const p = new URLSearchParams({
    bbox: bboxParam(b),
    bboxSR: "3857",
    imageSR: "3857",
    size: `${width},${height}`,
    format: "jpg",
    transparent: "false",
    f: "image",
  });
  return `${USGS_IMAGERY}/export?${p}`;
}

export function overlayUrl(b, width, height, layerId, root = NFHL_ROOT) {
  const p = new URLSearchParams({
    bbox: bboxParam(b),
    bboxSR: "3857",
    imageSR: "3857",
    size: `${width},${height}`,
    format: "png32",
    transparent: "true",
    layers: `show:${layerId}`,
    f: "image",
  });
  return `${root}/export?${p}`;
}

// Known flood-prone places and one dry control — probe inputs, not data.
const DEFAULT_POINTS = [
  [40.744, -74.0324, "hoboken"],
  [29.966, -90.09, "new-orleans"],
  [29.686, -95.46, "houston-meyerland"],
  [25.7907, -80.13, "miami-beach"],
  [40.026, -75.223, "philadelphia-manayunk"],
  [39.742, -104.991, "denver-downtown"],
];

const UA = { "user-agent": "UnderwriteCopilot/1.0 (+https://underwrite-copilot.onrender.com)" };

async function get(url, timeoutMs = 30_000) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  const type = res.headers.get("content-type") ?? "";
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type, buf };
}

async function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const out = arg("out") ?? "sheet";
  const points = (arg("points") ?? process.env.FLOOD_POINTS ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [lat, lng, label] = s.split(",").map((t) => t.trim());
      return [Number(lat), Number(lng), label || `${lat},${lng}`];
    });
  const list = points.length ? points : DEFAULT_POINTS;
  const zooms = (arg("zooms") ?? "17,19").split(",").map(Number).filter((z) => z >= 12 && z <= 20);
  const W = 1280;
  const H = 576;
  await mkdir(out, { recursive: true });

  // 1. Which layer is the zones — the service's own list, as lib/site-flags reads it.
  const svc = await get(`${NFHL_ROOT}?f=json`);
  console.log(`SERVICE ${NFHL_ROOT}?f=json · HTTP ${svc.status} · ${svc.type} · ${svc.buf.length} bytes`);
  let json = {};
  try {
    json = JSON.parse(svc.buf.toString("utf8"));
  } catch {
    console.log("  not JSON — stopping");
    return;
  }
  const layers = Array.isArray(json.layers) ? json.layers : [];
  const zones = layers.find((l) => /flood hazard zones/i.test(l.name ?? ""));
  console.log(`  ${layers.length} layers; flood hazard zones: ${zones ? `id ${zones.id} "${zones.name}"` : "NOT FOUND"}`);
  for (const l of layers) console.log(`    ${l.id}: ${l.name}${l.minScale || l.maxScale ? ` (scales ${l.minScale}–${l.maxScale})` : ""}`);
  console.log(`  copyrightText: ${JSON.stringify(json.copyrightText ?? null)}`);
  console.log(`  supportsDynamicLayers: ${json.supportsDynamicLayers}`);
  if (!zones) return;

  // 2. FEMA's own legend for that layer: each label and its swatch, saved.
  const leg = await get(`${NFHL_ROOT}/legend?f=json`);
  console.log(`LEGEND · HTTP ${leg.status} · ${leg.type} · ${leg.buf.length} bytes`);
  const index = { service: NFHL_ROOT, layerId: zones.id, layerName: zones.name, legend: [], frames: [] };
  try {
    const lj = JSON.parse(leg.buf.toString("utf8"));
    const entry = (lj.layers ?? []).find((l) => l.layerId === zones.id);
    for (const [i, item] of (entry?.legend ?? []).entries()) {
      const file = `legend-${String(i).padStart(2, "0")}.png`;
      if (item.imageData) await writeFile(join(out, file), Buffer.from(item.imageData, "base64"));
      console.log(`  ${i}: "${item.label}" · ${item.contentType ?? "?"} · ${item.width}×${item.height} · values ${JSON.stringify(item.values ?? [])}`);
      index.legend.push({ label: item.label, file, values: item.values ?? [] });
    }
  } catch (err) {
    console.log(`  legend unreadable — ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Each place: the zone at the point, then the aerial and the overlay
  //    for the same frame, and the two composited.
  let sharp = null;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.log("sharp is not installed here — saving the layers without composites");
  }
  for (const [lat, lng, label] of list) {
    const q = new URLSearchParams({
      f: "json",
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "FLD_ZONE,ZONE_SUBTY",
      returnGeometry: "false",
    });
    try {
      const z = await get(`${NFHL_ROOT}/${zones.id}/query?${q}`);
      const feats = JSON.parse(z.buf.toString("utf8")).features ?? [];
      console.log(`PLACE ${label} (${lat}, ${lng}): ${feats.length} zone(s) at the point — ${feats.map((f) => `${f.attributes?.FLD_ZONE}${f.attributes?.ZONE_SUBTY ? ` / ${f.attributes.ZONE_SUBTY}` : ""}`).join("; ") || "none"}`);
    } catch (err) {
      console.log(`PLACE ${label}: zone query failed — ${err instanceof Error ? err.message : String(err)}`);
    }
    for (const zoom of zooms) {
      const b = bboxFor(lat, lng, zoom, W, H);
      const [a, o] = await Promise.all([get(aerialUrl(b, W, H)), get(overlayUrl(b, W, H, zones.id))]);
      console.log(`  z${zoom}: aerial HTTP ${a.status} ${a.type} ${Math.round(a.buf.length / 1024)} KB · overlay HTTP ${o.status} ${o.type} ${Math.round(o.buf.length / 1024)} KB`);
      const base = `${label}-z${zoom}`;
      if (o.type.startsWith("image/")) await writeFile(join(out, `${base}-overlay.png`), o.buf);
      else console.log(`    overlay body: ${o.buf.toString("utf8").slice(0, 300)}`);
      if (sharp && a.type.startsWith("image/") && o.type.startsWith("image/")) {
        await sharp(a.buf)
          .composite([{ input: o.buf }])
          .jpeg({ quality: 82 })
          .toFile(join(out, `${base}.jpg`));
        index.frames.push({ place: label, lat, lng, zoom, file: `${base}.jpg`, overlay: `${base}-overlay.png` });
      }
    }
  }
  await writeFile(join(out, "index.json"), JSON.stringify(index, null, 2));
  await writeFile(
    join(out, "README.md"),
    [
      "# Flood sheet",
      "",
      `FEMA National Flood Hazard Layer (${NFHL_ROOT}), layer ${zones.id} "${zones.name}", drawn over USGS The National Map orthoimagery for the same Web-Mercator frame.`,
      `The service's copyright text: ${JSON.stringify(json.copyrightText ?? null)}.`,
      "",
      "Legend (FEMA's own labels and swatches):",
      ...index.legend.map((l) => `- ${l.file}: ${l.label}`),
      "",
      "Frames:",
      ...index.frames.map((f) => `- ${f.file}: ${f.place} at z${f.zoom}`),
      "",
    ].join("\n"),
  );
  console.log(`\nSaved ${index.frames.length} composites and ${index.legend.length} legend swatches to ${out}/`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
