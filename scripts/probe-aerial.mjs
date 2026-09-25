#!/usr/bin/env node
// How sharp can the USGS aerial of a building be? Rendered where the network
// is open and saved as pictures to be judged by eye.
//
//   node scripts/probe-aerial.mjs --out=sheet [--points="lat,lng,label;…"]
//
// WHY. When a deal has no photograph of its own, its picture is the USGS
// National Map's orthoimagery, asked for at the zoom that frames about 140 m
// of ground (lib/imagery-plan `frameZoom`, capped at z19). Nationally the
// imagery is NAIP at 0.6 m a pixel, so a z19 frame (about 0.23 m a pixel at
// 40°N) is the export service resampling a coarser photograph up to it — and
// a soft picture beside every property is exactly what the pipeline shows.
// Whether a wider native frame, a server-side resample, or a finish (contrast,
// colour, an unsharp mask) reads better is a question for the eye, and the
// sandbox that builds the app cannot reach the National Map. So this renders
// the variants side by side from the runner, measures each one's detail, and
// `skyline-sheet.yml`'s aerial mode pushes them to their own branch
// (`aerial-sheet`) for the sandbox to fetch and look at.
//
// The bbox is lib/basemaps' `mercatorBbox` (restated in probe-flood.mjs and
// held to it by a test), so a variant here is the frame the app would ask for.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { aerialUrl, bboxFor } from "./probe-flood.mjs";

// Probe inputs, not data: places whose buildings any reader would recognise,
// and the kinds of site a pipeline actually holds — a garden-apartment
// suburb, an office park, an industrial district.
const DEFAULT_POINTS = [
  [39.9526, -75.1652, "philadelphia-city-hall"],
  [40.7484, -73.9857, "nyc-empire-state"],
  [41.8789, -87.6359, "chicago-willis-tower"],
  [38.902, -77.039, "dc-k-street"],
  [33.928, -84.34, "atlanta-perimeter"],
  [32.799, -96.803, "dallas-uptown"],
  [33.495, -111.926, "scottsdale"],
  [39.742, -104.991, "denver-downtown"],
];

const UA = { "user-agent": "UnderwriteCopilot/1.0 (+https://underwrite-copilot.onrender.com)" };

async function get(url, timeoutMs = 30_000) {
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
      const type = res.headers.get("content-type") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());
      if (res.ok && type.startsWith("image/")) return { buf, error: null };
      last = `HTTP ${res.status} ${type} ${buf.toString("utf8").slice(0, 160)}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return { buf: null, error: last };
}

/** Detail, as the spread of a Laplacian over the grey image: a resampled
 *  photograph has less of it than the same frame at its native grain. */
async function detail(sharp, buf) {
  const { data } = await sharp(buf)
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], scale: 1, offset: 128 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  let sq = 0;
  for (const v of data) {
    const d = v - 128;
    sum += d;
    sq += d * d;
  }
  const n = data.length;
  return Math.sqrt(sq / n - (sum / n) ** 2);
}

/** The finish under test: a little contrast and colour back into NAIP's flat
 *  midday light, and an unsharp mask sized to the grain. */
function finish(sharp, buf) {
  return sharp(buf)
    .modulate({ brightness: 1.02, saturation: 1.12 })
    .linear(1.06, -6)
    .sharpen({ sigma: 0.7, m1: 0.6, m2: 2.2 })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
}

/** The marker the card would carry: a crisp white ring with a dark halo. */
function markerSvg(w, h) {
  const cx = w / 2;
  const cy = h / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<circle cx="${cx}" cy="${cy}" r="15" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="6"/>` +
      `<circle cx="${cx}" cy="${cy}" r="15" fill="none" stroke="#ffffff" stroke-width="3"/>` +
      `<circle cx="${cx}" cy="${cy}" r="3" fill="#ffffff"/>` +
      `</svg>`,
  );
}

function labelSvg(w, text) {
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="34">` +
      `<rect width="${w}" height="34" fill="rgba(0,0,0,0.62)"/>` +
      `<text x="12" y="23" font-family="DejaVu Sans, sans-serif" font-size="17" fill="#ffffff">${safe}</text>` +
      `</svg>`,
  );
}

async function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const out = arg("out") ?? "sheet";
  const points = (arg("points") ?? process.env.AERIAL_POINTS ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [lat, lng, label] = s.split(",").map((t) => t.trim());
      return [Number(lat), Number(lng), label || `${lat},${lng}`];
    });
  const list = points.length ? points : DEFAULT_POINTS;
  const sharp = (await import("sharp")).default;
  await mkdir(out, { recursive: true });

  const W = 720;
  const H = 450;
  const index = { size: `${W}x${H}`, places: [] };

  for (const [lat, lng, label] of list) {
    console.log(`PLACE ${label} (${lat}, ${lng})`);
    const at = (zoom, w, h) => aerialUrl(bboxFor(lat, lng, zoom, w, h), w, h);
    const [z19, z18, z18half, z17] = await Promise.all([
      get(at(19, W, H)),
      get(at(18, W, H)),
      // z19's ground at z18's grain: the same frame as A with half the pixels.
      get(at(18, W / 2, H / 2)),
      get(at(17, W, H)),
    ]);
    for (const [name, r] of Object.entries({ z19, z18, z18half, z17 })) {
      if (r.error) console.log(`  ${name}: ${r.error}`);
    }
    if (!z19.buf || !z18.buf || !z18half.buf || !z17.buf) continue;

    const variants = [
      ["A", "z19 export (today)", z19.buf],
      ["B", "z18 export, a wider frame", z18.buf],
      [
        "C",
        "z19 frame from z18 grain, lanczos + sharpen",
        await sharp(z18half.buf)
          .resize(W, H, { kernel: "lanczos3" })
          .sharpen({ sigma: 0.9, m1: 0.8, m2: 2.4 })
          .jpeg({ quality: 84, mozjpeg: true })
          .toBuffer(),
      ],
      ["D", "z18, finished", await finish(sharp, z18.buf)],
      ["E", "z17, finished", await finish(sharp, z17.buf)],
      [
        "F",
        "z18, finished, with the marker",
        await sharp(await finish(sharp, z18.buf))
          .composite([{ input: markerSvg(W, H) }])
          .jpeg({ quality: 84, mozjpeg: true })
          .toBuffer(),
      ],
    ];

    const place = { label, lat, lng, variants: [] };
    const tiles = [];
    for (const [key, what, buf] of variants) {
      const d = await detail(sharp, buf);
      const file = `${label}-${key}.jpg`;
      await writeFile(join(out, file), buf);
      console.log(`  ${key} ${what}: detail ${d.toFixed(2)} · ${Math.round(buf.length / 1024)} KB`);
      place.variants.push({ key, what, file, detail: Number(d.toFixed(2)), kb: Math.round(buf.length / 1024) });
      tiles.push(
        await sharp(buf)
          .resize(W, H)
          .composite([{ input: labelSvg(W, `${key} · ${what} · detail ${d.toFixed(1)}`), top: 0, left: 0 }])
          .jpeg({ quality: 82 })
          .toBuffer(),
      );
    }
    // One sheet a place: three across, two down.
    const sheet = await sharp({
      create: { width: W * 3 + 16, height: H * 2 + 8, channels: 3, background: { r: 245, g: 243, b: 238 } },
    })
      .composite(tiles.map((input, i) => ({ input, left: (i % 3) * (W + 8), top: Math.floor(i / 3) * (H + 8) })))
      .jpeg({ quality: 80 })
      .toBuffer();
    await writeFile(join(out, `${label}-sheet.jpg`), sheet);
    place.sheet = `${label}-sheet.jpg`;
    index.places.push(place);
  }

  await writeFile(join(out, "index.json"), JSON.stringify(index, null, 2));
  await writeFile(
    join(out, "README.md"),
    [
      "# Aerial sheet",
      "",
      "USGS The National Map orthoimagery (USGSImageryOnly export), public domain, rendered for each place six ways at 720x450:",
      "A the z19 export the app asks for today; B z18 (a wider frame at the imagery's grain); C z19's frame fetched at z18's grain and resampled with lanczos3 and an unsharp mask; D B finished (contrast, colour, unsharp mask); E z17 finished; F D with the card's marker.",
      "Detail is the spread of a Laplacian over the grey image — a resampled photograph has less of it than its own grain.",
      "",
      ...index.places.map((p) => `- ${p.sheet}: ${p.label} — ${p.variants.map((v) => `${v.key} ${v.detail}`).join(", ")}`),
      "",
    ].join("\n"),
  );
  console.log(`\nSaved ${index.places.length} places to ${out}/`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
