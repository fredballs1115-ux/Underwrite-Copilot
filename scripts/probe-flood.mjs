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

/**
 * The zones restyled through the service's own dynamic layers (it reports
 * `supportsDynamicLayers: true`): FEMA's features, classified EXACTLY as
 * FEMA's own legend classifies them — every legend entry's FLD_ZONE,ZONE_SUBTY
 * values, "<Null>" and all — and only the drawing changed: a light tint and
 * a crisp outline a class in the site's palette, over a wide white casing so
 * an edge reads over a busy roofscape, FEMA's labels off (the page says the
 * zone in words). A first cut keyed the 1% zone on SFHA_TF and drew nothing
 * over Hoboken's and New Orleans' Zone AE, whose polygons do not carry it:
 * FEMA's own classes are the only safe key.
 *
 * lib/flood-style.ts is the site's copy (`floodDynamicLayers`); this one is
 * restated for plain Node and lib/flood-style.test.ts holds the two equal.
 */
export const CLASS_STYLE = [
  // [legend label pattern, fill RGBA, outline RGBA, outline width, hatch [direction, RGBA] or null]
  [/floodway/i, [30, 136, 229, 105], [183, 28, 28, 255], 2.25, ["backward", [229, 57, 53, 200]]],
  [/^1% annual chance/i, [30, 136, 229, 105], [13, 71, 161, 255], 2.25, null],
  [/^0\.2% annual chance/i, [255, 179, 0, 85], [230, 126, 0, 255], 2, null],
  [/future conditions/i, [142, 36, 170, 70], [106, 27, 154, 255], 1.75, null],
  [/reduced risk due to levee/i, [0, 137, 123, 60], [0, 105, 92, 255], 1.75, null],
  [/risk due to levee/i, [141, 110, 99, 60], [93, 64, 55, 240], 1.75, ["forward", [141, 110, 99, 200]]],
  [/undetermined/i, [117, 117, 117, 60], [66, 66, 66, 240], 1.75, ["forward", [117, 117, 117, 200]]],
];

export function restyledLayers(layerId, legend, { transparency = 0 } = {}) {
  const source = { type: "mapLayer", mapLayerId: layerId };
  const line = (color, width) => ({ type: "esriSLS", style: "esriSLSSolid", color, width });
  const infos = (symbolOf) =>
    legend.flatMap((entry) => {
      const style = CLASS_STYLE.find(([re]) => re.test(String(entry.label ?? "").trim()));
      if (!style || !(entry.values ?? []).length) return [];
      const symbol = symbolOf(style);
      return symbol ? entry.values.map((value) => ({ value, label: entry.label, symbol })) : [];
    });
  // Drawn top first: the hatches (with the hatched classes' outlines), the
  // tints and the other outlines, then the casings. The floodway carries the
  // 1% tint under its hatch: it is part of the 1% zone.
  const hatches = infos(([, , outline, width, hatch]) =>
    hatch
      ? { type: "esriSFS", style: hatch[0] === "backward" ? "esriSFSBackwardDiagonal" : "esriSFSForwardDiagonal", color: hatch[1], outline: line(outline, width) }
      : null,
  );
  const tints = infos(([, fill, outline, width, hatch]) => ({ type: "esriSFS", style: "esriSFSSolid", color: fill, outline: hatch ? null : line(outline, width) }));
  const casings = infos(([, , , width]) => ({ type: "esriSFS", style: "esriSFSNull", outline: line([255, 255, 255, 210], width + 2.25) }));
  if (!tints.length) return null;
  // FEMA's layer carries a 70% transparency of its own; zero asks for the
  // symbols' own alpha (the experiment's `undefined` leaves the key out).
  const layer = (id, uniqueValueInfos) => ({
    id,
    source,
    drawingInfo: {
      renderer: { type: "uniqueValue", field1: "FLD_ZONE", field2: "ZONE_SUBTY", fieldDelimiter: ",", uniqueValueInfos },
      ...(transparency === undefined ? {} : { transparency }),
      showLabels: false,
    },
  });
  return [...(hatches.length ? [layer(901, hatches)] : []), layer(902, tints), layer(903, casings)];
}

/** The restyled export's form: POSTed, since FEMA's full class list makes
 *  the dynamic layers some 50 KB — past what a URL carries. */
export function restyledOverlayForm(b, width, height, layerId, legend, { transparency, format = "png32", dpi } = {}) {
  return new URLSearchParams({
    bbox: bboxParam(b),
    bboxSR: "3857",
    imageSR: "3857",
    size: `${width},${height}`,
    format,
    transparent: "true",
    dynamicLayers: JSON.stringify(restyledLayers(layerId, legend, transparency === undefined ? {} : { transparency })),
    ...(dpi ? { dpi: String(dpi) } : {}),
    f: "image",
  });
}

/**
 * Where a frame is drawn in a colour near `rgb`, and the alpha its interior
 * carries (the mode over those pixels) — the measurement the restyle's
 * transparency turns on, read off the picture rather than assumed.
 */
async function alphaOf(sharp, png, rgb, tol = 16) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const hist = new Map();
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (Math.abs(data[i] - rgb[0]) > tol || Math.abs(data[i + 1] - rgb[1]) > tol || Math.abs(data[i + 2] - rgb[2]) > tol) continue;
    n++;
    hist.set(data[i + 3], (hist.get(data[i + 3]) ?? 0) + 1);
  }
  const mode = [...hist.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { share: n / (info.width * info.height), alpha: mode, width: info.width, height: info.height };
}

/** FEMA's own polygons for a frame, from the zones layer's query: every zone
 *  (Zone X of minimal hazard included — the drawing decides what to leave
 *  undrawn), in the frame's own projection, generalised to half a pixel. */
export function frameQuery(b, zoom, { quantize = false } = {}) {
  const env = { xmin: b.minX, ymin: b.minY, xmax: b.maxX, ymax: b.maxY, spatialReference: { wkid: 3857 } };
  const res = RES_Z0 / 2 ** zoom;
  return new URLSearchParams({
    f: "json",
    where: "1=1",
    geometry: JSON.stringify(env),
    geometryType: "esriGeometryEnvelope",
    inSR: "3857",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DEPTH,V_DATUM,LEN_UNIT",
    returnGeometry: "true",
    outSR: "3857",
    ...(quantize
      ? { quantizationParameters: JSON.stringify({ mode: "view", originPosition: "upperLeft", tolerance: res / 2, extent: env }) }
      : { maxAllowableOffset: (res / 2).toFixed(3), geometryPrecision: "1" }),
  });
}

const vertexCount = (features) =>
  features.reduce((n, f) => n + (f.geometry?.rings ?? []).reduce((m, r) => m + r.length, 0), 0);

/** The building's ring as the page draws it: white over a dark halo. */
const ringSvg = (width, height) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<circle cx="${width / 2}" cy="${height / 2}" r="15" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="7"/>` +
      `<circle cx="${width / 2}" cy="${height / 2}" r="15" fill="none" stroke="#ffffff" stroke-width="3.5"/>` +
      `<circle cx="${width / 2}" cy="${height / 2}" r="3" fill="#ffffff"/>` +
      `</svg>`,
  );

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

// FEMA's host resets connections now and then (the first run of this probe
// died on an ECONNRESET before printing anything), so a request is asked
// three times with a pause, and a failure is printed rather than thrown:
// a probe that crashes on the first refusal says nothing about the rest.
async function get(url, timeoutMs = 30_000) {
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
      const type = res.headers.get("content-type") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, type, buf, error: null };
    } catch (err) {
      const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
      last = `${err instanceof Error ? err.message : String(err)}${cause}`;
      console.log(`    attempt ${attempt} failed: ${last}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return { status: 0, type: "", buf: Buffer.alloc(0), error: last };
}

/** A POST of a form, asked three times like `get`. */
async function post(url, form, timeoutMs = 30_000) {
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { ...UA, "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const type = res.headers.get("content-type") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, type, buf, error: null };
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
      console.log(`    attempt ${attempt} failed: ${last}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return { status: 0, type: "", buf: Buffer.alloc(0), error: last };
}

// The documented service root first, then the older path the same host
// has served the layer under — each a claim this probe exists to test.
const ROOTS = [NFHL_ROOT, "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer"];

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

  // 1. Which layer is the zones — the service's own list, as lib/site-flags
  //    reads it — from the first root that answers one.
  let root = null;
  let json = {};
  for (const r of ROOTS) {
    const svc = await get(`${r}?f=json`);
    console.log(`SERVICE ${r}?f=json · HTTP ${svc.status} · ${svc.type} · ${svc.buf.length} bytes${svc.error ? ` · ${svc.error}` : ""}`);
    try {
      const parsed = JSON.parse(svc.buf.toString("utf8"));
      if (Array.isArray(parsed.layers)) {
        root = r;
        json = parsed;
        break;
      }
      console.log(`  JSON without a layer list: ${svc.buf.toString("utf8").slice(0, 300)}`);
    } catch {
      if (svc.buf.length) console.log(`  not JSON: ${svc.buf.toString("utf8").slice(0, 300)}`);
    }
  }
  if (!root) {
    console.log("No root answered a layer list — stopping.");
    return;
  }
  const layers = Array.isArray(json.layers) ? json.layers : [];
  const zones = layers.find((l) => /flood hazard zones/i.test(l.name ?? ""));
  console.log(`  ${layers.length} layers; flood hazard zones: ${zones ? `id ${zones.id} "${zones.name}"` : "NOT FOUND"}`);
  for (const l of layers) console.log(`    ${l.id}: ${l.name}${l.minScale || l.maxScale ? ` (scales ${l.minScale}–${l.maxScale})` : ""}`);
  console.log(`  copyrightText: ${JSON.stringify(json.copyrightText ?? null)}`);
  console.log(`  supportsDynamicLayers: ${json.supportsDynamicLayers}`);
  // The export's own limits: a frame at twice the pixels for the same ground
  // needs maxImageWidth / maxImageHeight to allow it.
  console.log(`  maxImageWidth ${json.maxImageWidth} · maxImageHeight ${json.maxImageHeight} · maxRecordCount ${json.maxRecordCount}`);
  console.log(`  supportedImageFormatTypes: ${json.supportedImageFormatTypes}`);
  if (!zones) return;

  // 1b. The zone layer's own description: its fields (the restyle's
  //     definition expressions name FLD_ZONE, ZONE_SUBTY and SFHA_TF), its
  //     geometry type and its query limits — printed, never assumed.
  const lay = await get(`${root}/${zones.id}?f=json`);
  try {
    const lj = JSON.parse(lay.buf.toString("utf8"));
    console.log(`LAYER ${zones.id} · HTTP ${lay.status} · geometry ${lj.geometryType} · maxRecordCount ${lj.maxRecordCount} · capabilities ${lj.capabilities}`);
    console.log(`  fields: ${(lj.fields ?? []).map((f) => `${f.name}:${String(f.type).replace("esriFieldType", "")}`).join(", ")}`);
    console.log(`  renderer: ${lj.drawingInfo?.renderer?.type ?? "?"} · labels ${lj.hasLabels ?? "?"}`);
    const rr = lj.drawingInfo?.renderer ?? {};
    console.log(`  renderer fields: ${JSON.stringify([rr.field1, rr.field2, rr.field3])} · delimiter ${JSON.stringify(rr.fieldDelimiter)} · defaultSymbol ${rr.defaultSymbol ? JSON.stringify(rr.defaultSymbol).slice(0, 200) : "none"} · defaultLabel ${JSON.stringify(rr.defaultLabel ?? null)}`);
    console.log(`  drawingInfo.transparency ${JSON.stringify(lj.drawingInfo?.transparency ?? null)} · first symbol ${JSON.stringify(rr.uniqueValueInfos?.[0]?.symbol ?? null).slice(0, 300)}`);
    console.log(`  supportedQueryFormats ${lj.supportedQueryFormats} · supportsCoordinatesQuantization ${lj.supportsCoordinatesQuantization} · advancedQueryCapabilities ${JSON.stringify(lj.advancedQueryCapabilities ?? null)}`);
  } catch (err) {
    console.log(`LAYER ${zones.id} unreadable — ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. FEMA's own legend for that layer: each label and its swatch, saved.
  const leg = await get(`${root}/legend?f=json`);
  console.log(`LEGEND · HTTP ${leg.status} · ${leg.type} · ${leg.buf.length} bytes`);
  const index = { service: root, layerId: zones.id, layerName: zones.name, legend: [], frames: [] };
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
      const z = await get(`${root}/${zones.id}/query?${q}`);
      const feats = JSON.parse(z.buf.toString("utf8")).features ?? [];
      console.log(`PLACE ${label} (${lat}, ${lng}): ${feats.length} zone(s) at the point — ${feats.map((f) => `${f.attributes?.FLD_ZONE}${f.attributes?.ZONE_SUBTY ? ` / ${f.attributes.ZONE_SUBTY}` : ""}`).join("; ") || "none"}`);
    } catch (err) {
      console.log(`PLACE ${label}: zone query failed — ${err instanceof Error ? err.message : String(err)}`);
    }
    for (const zoom of zooms) {
      const b = bboxFor(lat, lng, zoom, W, H);
      const [a, o] = await Promise.all([get(aerialUrl(b, W, H)), get(overlayUrl(b, W, H, zones.id, root))]);
      console.log(`  z${zoom}: aerial HTTP ${a.status} ${a.type} ${Math.round(a.buf.length / 1024)} KB · overlay HTTP ${o.status} ${o.type} ${Math.round(o.buf.length / 1024)} KB`);
      const base = `${label}-z${zoom}`;
      if (o.type.startsWith("image/")) await writeFile(join(out, `${base}-overlay.png`), o.buf);
      else console.log(`    overlay body: ${o.buf.toString("utf8").slice(0, 300)}`);
      if (sharp && a.type.startsWith("image/") && o.type.startsWith("image/")) {
        await sharp(a.buf)
          .composite([{ input: o.buf }, { input: ringSvg(W, H) }])
          .jpeg({ quality: 82 })
          .toFile(join(out, `${base}.jpg`));
        index.frames.push({ place: label, lat, lng, zoom, file: `${base}.jpg`, overlay: `${base}-overlay.png` });
      }
      // The same frame restyled (the deal page's zoom only), for the eye to
      // set beside FEMA's own styling.
      if (zoom === 17) {
        const t0 = Date.now();
        const form = restyledOverlayForm(b, W, H, zones.id, index.legend);
        const r = await post(`${root}/export`, form);
        console.log(`  z${zoom} restyled form: ${Math.round(form.toString().length / 1024)} KB`);
        console.log(`  z${zoom} restyled: overlay HTTP ${r.status} ${r.type} ${Math.round(r.buf.length / 1024)} KB in ${Date.now() - t0} ms`);
        if (!r.type.startsWith("image/")) console.log(`    restyled body: ${r.buf.toString("utf8").slice(0, 400)}`);
        else {
          await writeFile(join(out, `${base}-restyled-overlay.png`), r.buf);
          if (sharp && a.type.startsWith("image/")) {
            await sharp(a.buf)
              .composite([{ input: r.buf }, { input: ringSvg(W, H) }])
              .jpeg({ quality: 82 })
              .toFile(join(out, `${base}-restyled.jpg`));
            // …and over a calmer photograph: the aerial a little muted, so
            // the zones carry the colour and the photo the place.
            const muted = await sharp(a.buf).modulate({ saturation: 0.55, brightness: 0.96 }).toBuffer();
            await sharp(muted)
              .composite([{ input: r.buf }, { input: ringSvg(W, H) }])
              .jpeg({ quality: 82 })
              .toFile(join(out, `${base}-restyled-muted.jpg`));
            index.frames.push({ place: label, lat, lng, zoom, file: `${base}-restyled.jpg`, overlay: `${base}-restyled-overlay.png`, restyled: true });
            index.frames.push({ place: label, lat, lng, zoom, file: `${base}-restyled-muted.jpg`, overlay: `${base}-restyled-overlay.png`, restyled: true, muted: true });
          }
        }
      }
      // 4. The experiment (#472), at the deal page's zoom. Three questions,
      //    each answered by what comes back rather than by the docs:
      if (zoom === 17 && sharp) {
        if (a.type.startsWith("image/")) await writeFile(join(out, `${base}-aerial.jpg`), a.buf);
        //  (a) what a dynamic layer's `transparency` does to FEMA's 70%:
        //      the 1% zone's fill is asked at alpha 105; the interior's alpha
        //      is read back for each variant.
        for (const t of [undefined, 0, 1, 25]) {
          const r = await post(`${root}/export`, restyledOverlayForm(b, W, H, zones.id, index.legend, { transparency: t }));
          const m = r.type.startsWith("image/") ? await alphaOf(sharp, r.buf, [30, 136, 229]) : null;
          console.log(`  z17 transparency ${t === undefined ? "omitted" : t}: HTTP ${r.status} ${r.type}${m ? ` · 1% fill on ${(m.share * 100).toFixed(1)}% of the frame at alpha ${m.alpha}` : ` · ${r.buf.toString("utf8").slice(0, 200)}`}`);
        }
        //  (b) the same ground at twice the pixels (dpi 192): a crisp edge on
        //      a 2x screen, if the service allows the size.
        {
          const t0 = Date.now();
          const r = await post(`${root}/export`, restyledOverlayForm(b, W * 2, H * 2, zones.id, index.legend, { dpi: 192 }));
          const m = r.type.startsWith("image/") ? await alphaOf(sharp, r.buf, [30, 136, 229]) : null;
          console.log(`  z17 at 2x (dpi 192): HTTP ${r.status} ${r.type} ${Math.round(r.buf.length / 1024)} KB in ${Date.now() - t0} ms${m ? ` · ${m.width}×${m.height} · 1% fill on ${(m.share * 100).toFixed(1)}%` : ` · ${r.buf.toString("utf8").slice(0, 200)}`}`);
          if (m) await writeFile(join(out, `${base}-restyled-2x.png`), r.buf);
        }
        //  (c) FEMA's own polygons for the frame, to draw them ourselves:
        //      the size, the time, the classes — and the features saved so
        //      the sandbox can draw them over the aerial saved above.
        for (const quantize of [false, true]) {
          const t0 = Date.now();
          const r = await post(`${root}/${zones.id}/query`, frameQuery(b, zoom, { quantize }));
          try {
            const qj = JSON.parse(r.buf.toString("utf8"));
            if (qj.error) throw new Error(JSON.stringify(qj.error).slice(0, 300));
            const feats = qj.features ?? [];
            const classes = new Map();
            for (const f of feats) {
              const k = `${f.attributes?.FLD_ZONE ?? "?"},${f.attributes?.ZONE_SUBTY ?? "<Null>"}`;
              classes.set(k, (classes.get(k) ?? 0) + 1);
            }
            console.log(`  z17 query${quantize ? " (quantized)" : ""}: HTTP ${r.status} · ${Math.round(r.buf.length / 1024)} KB in ${Date.now() - t0} ms · ${feats.length} features · ${vertexCount(feats)} vertices · exceededTransferLimit ${qj.exceededTransferLimit ?? false}`);
            console.log(`    classes: ${[...classes.entries()].map(([k, n]) => `${k} ×${n}`).join("; ")}`);
            if (quantize) console.log(`    transform: ${JSON.stringify(qj.transform ?? null)}`);
            await writeFile(join(out, `${base}-features${quantize ? "-q" : ""}.json`), r.buf);
          } catch (err) {
            console.log(`  z17 query${quantize ? " (quantized)" : ""}: HTTP ${r.status} ${r.type} in ${Date.now() - t0} ms — ${err instanceof Error ? err.message : String(err)} · ${r.buf.toString("utf8").slice(0, 200)}`);
          }
        }
        //  (d) the restyle as SVG: FEMA clips and projects, the drawing is
        //      text a server could rewrite — saved to be read, never served.
        {
          const r = await post(`${root}/export`, restyledOverlayForm(b, W, H, zones.id, index.legend, { format: "svg" }));
          console.log(`  z17 svg: HTTP ${r.status} ${r.type} ${Math.round(r.buf.length / 1024)} KB · starts ${JSON.stringify(r.buf.toString("utf8").slice(0, 120))}`);
          if (r.buf.length) await writeFile(join(out, `${base}-restyled.svg.txt`), r.buf);
        }
      }
    }
  }
  await writeFile(join(out, "index.json"), JSON.stringify(index, null, 2));
  await writeFile(
    join(out, "README.md"),
    [
      "# Flood sheet",
      "",
      `FEMA National Flood Hazard Layer (${root}), layer ${zones.id} "${zones.name}", drawn over USGS The National Map orthoimagery for the same Web-Mercator frame.`,
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
