// The drawing a deal's cover is made of (#442), as one SVG document (#443)
// for every surface that shows it: the pipeline's card and list row (drawn
// by `DealCover` from `coverImage`), and the pictures served as files — the
// ⌘K list, the comps from the reader's own pipeline, the deal page's sticky
// bar and the pipeline map's hover card through
// /api/deals/[id]/image?fallback=cover, and the emails through
// /api/email/picture (#464). One drawing, so every one of those shows the
// same cover for the same deal.
//
// A cover is an illustration, never a photograph and never a map: a sky
// with a low sun, the deal's kind of building standing on its ground line
// with its lit face toward the sun and its other face in shade, a few of its
// windows lit, and its reflection on the ground beneath, where a card sets
// its words. The deal's tone (one of twelve skies) and its variant are drawn
// from its id, so a deal always wears the same cover and a pipeline wears
// many. The variant is the deal's own draw of the scene (`coverDraw`,
// research pass 29: a pipeline of one class had been a wall of twins told
// apart by their skies): the hour — the evening it always was, a night with
// its windows lit, or a morning — which side the light comes from, where the
// building stands, the buildings in shade beside it and the trees along the
// street, the sun's place, and which windows are lit.
//
// Pure and dependency-free, so a client component can draw from it without
// the asset-class table (lib/deal-cover reads the class; this only draws).

/** What the cover draws: the building types a pipeline holds. */
export type CoverKind = "housing" | "homes" | "office" | "industrial" | "retail" | "hotel" | "storage" | "land" | "building";

export const COVER_KINDS: readonly CoverKind[] = [
  "housing",
  "homes",
  "office",
  "industrial",
  "retail",
  "hotel",
  "storage",
  "land",
  "building",
];

/** A cover's colours, one sky and the light it throws. */
export interface CoverTone {
  /** the sky from the top of the frame to the horizon */
  sky: readonly [string, string, string];
  /** the low sun and its glow */
  sun: string;
  /** the distant skyline or hills, in the haze */
  haze: string;
  /** the face the light falls on, from its top to its foot */
  lit: readonly [string, string];
  /** an edge catching the light: a parapet, a sign, a stake */
  rim: string;
  /** the face turned away from the light */
  shade: string;
  /** an unlit window on the lit face, and on the shaded one */
  pane: readonly [string, string];
  /** a lit window: a lamp at the glass, and one deeper in the room */
  glow: readonly [string, string];
  /** the ground, from the horizon to the foot of the frame */
  ground: readonly [string, string];
  /** the one colour a kind picks out: an awning, a storage door, a survey flag */
  accent: string;
  /** trees and posts, dark against the sky */
  tree: string;
}

/**
 * The twelve skies, each a hue family from the evening: teal, harbour blue,
 * forest, slate, plum, brick, sea, bronze, and — since research pass 29, when
 * eight let three of every seventeen deals share one — indigo, rose, olive
 * and moss. The pipeline's cards are told apart by colour, and none of them
 * shouts over the photographs beside it. The ground under every sky is deep,
 * so a card's white words read on it (held by the test).
 */
export const COVER_TONES: readonly CoverTone[] = [
  // teal: an evening over the water
  {
    sky: ["#153331", "#437e7a", "#efdbb3"],
    sun: "#fff3db",
    haze: "#7d968c",
    lit: ["#aac0b8", "#739692"],
    rim: "#d9dccb",
    shade: "#2d4d4b",
    pane: ["#3f6462", "#192f2d"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#1b3230", "#0d1a19"],
    accent: "#d47349",
    tree: "#203735",
  },
  // harbour: the blue hour
  {
    sky: ["#132334", "#405f81", "#efcdb3"],
    sun: "#ffebdb",
    haze: "#7c848f",
    lit: ["#a9b1bb", "#718297"],
    rim: "#d8d1cd",
    shade: "#2b3c4f",
    pane: ["#3d5066", "#182330"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#192533", "#0c131a"],
    accent: "#e08b52",
    tree: "#1f2b38",
  },
  // forest: sage, late in the day
  {
    sky: ["#1c2c23", "#51705f", "#efdfb3"],
    sun: "#fff5db",
    haze: "#84907e",
    lit: ["#b0bbad", "#7c8e80"],
    rim: "#dbdbc6",
    shade: "#35463c",
    pane: ["#485b50", "#1e2923"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#202c25", "#101713"],
    accent: "#db8543",
    tree: "#25312b",
  },
  // slate: an overcast dusk
  {
    sky: ["#1d222a", "#545e6d", "#efd1b3"],
    sun: "#ffeddb",
    haze: "#868585",
    lit: ["#b1b1b3", "#7d8289"],
    rim: "#dcd2c9",
    shade: "#363c44",
    pane: ["#4a5059", "#1f2328"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#21252b", "#101316"],
    accent: "#d07858",
    tree: "#262a30",
  },
  // plum: twilight, rose at the horizon
  {
    sky: ["#28192e", "#6a4d75", "#efc1b3"],
    sun: "#ffe4db",
    haze: "#917889",
    lit: ["#baa7b6", "#8b768f"],
    rim: "#e0c9ca",
    shade: "#423248",
    pane: ["#58455e", "#271c2b"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#2a1e2e", "#150f18"],
    accent: "#eeb94f",
    tree: "#2f2333",
  },
  // brick: a sunset over warm stone
  {
    sky: ["#351712", "#83483f", "#efcfb3"],
    sun: "#ffecdb",
    haze: "#9d786e",
    lit: ["#c5a79f", "#9b736c"],
    rim: "#e5cdc0",
    shade: "#502f2a",
    pane: ["#67423c", "#301a17"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#341c19", "#1b0e0c"],
    accent: "#47a1b8",
    tree: "#39221e",
  },
  // sea: a clear evening over the sea
  {
    sky: ["#112c37", "#3c7286", "#efdfb3"],
    sun: "#fff5db",
    haze: "#799291",
    lit: ["#a7bbbd", "#6e8f99"],
    rim: "#d7dbce",
    shade: "#294752",
    pane: ["#3a5d69", "#162a31"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#182d35", "#0b171b"],
    accent: "#db6e4d",
    tree: "#1d323a",
  },
  // bronze: the golden hour
  {
    sky: ["#372410", "#88613a", "#efdbb3"],
    sun: "#fff3db",
    haze: "#9f886b",
    lit: ["#c7b39d", "#9e846a"],
    rim: "#e6d6bf",
    shade: "#533d28",
    pane: ["#6a5239", "#322415"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#362617", "#1c130b"],
    accent: "#4691a4",
    tree: "#3b2b1c",
  },
  // The four added in research pass 29, each slot at the eight's own
  // lightness at a hue the eight leave open.
  // indigo: a deep blue dusk, peach at the horizon
  {
    sky: ["#121336", "#3e4084", "#efc5b3"],
    sun: "#ffe6db",
    haze: "#7d7996",
    lit: ["#a5a6c0", "#717298"],
    rim: "#e1cec7",
    shade: "#2b2c50",
    pane: ["#3c3e67", "#171831"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#191a33", "#0d0d1c"],
    accent: "#ebaf47",
    tree: "#1e1f38",
  },
  // rose: a rose dusk over warm stone
  {
    sky: ["#341420", "#80425b", "#efc7b3"],
    sun: "#ffe7db",
    haze: "#967987",
    lit: ["#bfa6b0", "#967381"],
    rim: "#e1cfc7",
    shade: "#4e2d3a",
    pane: ["#653f4e", "#2f1821"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#321b24", "#1b0d13"],
    accent: "#46a498",
    tree: "#372029",
  },
  // olive: a dry evening, the light like straw
  {
    sky: ["#323115", "#7d7b45", "#efe1b3"],
    sun: "#fff7db",
    haze: "#969279",
    lit: ["#bebda7", "#949375"],
    rim: "#e1dbc7",
    shade: "#4c4b2f",
    pane: ["#636141", "#2e2d19"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#31301c", "#1b1a0e"],
    accent: "#d05f43",
    tree: "#363521",
  },
  // moss: a mild evening over the green
  {
    sky: ["#202f18", "#59784a", "#efe5b3"],
    sun: "#fff9db",
    haze: "#889679",
    lit: ["#b0bbaa", "#809178"],
    rim: "#e1dcc7",
    shade: "#394931",
    pane: ["#4d5f44", "#212c1b"],
    glow: ["#ffda85", "#f4b25e"],
    ground: ["#232f1e", "#13190f"],
    accent: "#cc5c6b",
    tree: "#293423",
  },
];

/** What a cover is drawn from: its kind of building, its sky and its draw. */
export interface CoverScene {
  kind: CoverKind;
  /** which of `COVER_TONES` */
  tone: number;
  /** the deal's own draw of the scene (`coverDraw`): its hour, its light's
   *  side, where the building stands and what stands beside it, where the
   *  sun sits, which windows are lit */
  variant: number;
}

/** The hour a cover is drawn at: the evening it always was, a night with
 *  its windows lit under a moon, or a morning with its lights mostly off. */
export type CoverTime = "dusk" | "night" | "morning";

/** What a deal's draw decides about its scene beyond its sky. */
export interface CoverDraw {
  time: CoverTime;
  /** the scene flipped: the sun on the right, the building's lit face
   *  turned toward it */
  mirror: boolean;
  /** where the building stands in the room the sun leaves it, from 0 (as
   *  near the sun as it may) to 1 (as far) */
  place: number;
  /** low buildings in shade on the far side from the sun, 0 to 2 */
  neighbours: number;
  /** trees along the street, beside the building, 0 to 2 */
  trees: number;
}

/** The hours by the variant's two lowest bits: the evening half the time. */
const TIMES: readonly CoverTime[] = ["dusk", "dusk", "night", "morning"];

/**
 * A deal's draw of its scene, from its variant. The hour and the side are
 * the variant's own low bits, so every hour on either side is a variant a
 * test can name; the rest is the variant's seeded draw.
 */
export function coverDraw(variant: number): CoverDraw {
  const v = variant >>> 0;
  const d = draw(v ^ 0x3c6ef372);
  return {
    time: TIMES[v & 3],
    mirror: (v & 4) !== 0,
    place: d(),
    neighbours: [0, 1, 1, 2][Math.floor(d() * 4)],
    trees: Math.floor(d() * 3),
  };
}

/** The drawing's edition, in the image route's validator: a browser holding
 *  a cover drawn to an earlier edition is sent this one, never a 304. 3 is
 *  research pass 29's: twelve skies, the hours, the mirror, the building's
 *  place, its neighbours and trees, and the land drawn boldly when small. */
export const COVER_EDITION = 3;

/** At or under this many pixels on its short side a frame is drawn simply:
 *  the building larger, fewer and larger windows, no clouds, and no lights
 *  in the distant city. */
export const SMALL_FRAME_PX = 160;

const HEX = /^#[0-9a-f]{6}$/i;

/** A number as the document writes it: one decimal, no negative zero. */
function f(v: number): string {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? "0" : String(r);
}

/** A seeded draw, so a deal's details are its own and the same each time. */
function draw(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** A rectangle as path data, from its top-left corner. */
function R(x: number, y: number, w: number, h: number): string {
  return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;
}

/** A closed shape through its corners, as path data. */
function poly(...pts: readonly (readonly [number, number])[]): string {
  return `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}z`;
}

/** A circle as path data. */
function disc(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`;
}

/** A filled shape. */
function fill(colour: string, d: string, extra = ""): string {
  return d ? `<path fill="${colour}"${extra} d="${d}"/>` : "";
}

/** A number as `f` writes it, as a number: the pen of `strokes` moves
 *  between written positions, so its moves never drift. */
function at1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** A large frame's scene in whole pixels: a tenth of a pixel on a distant
 *  block, a street tree or a star is nothing anyone sees, and it is a card's
 *  characters. A small frame's keeps `f`'s tenths. */
function scenePx(small: boolean): (v: number) => number {
  return small ? at1 : Math.round;
}

/** A number written as a scene's rounding gives it, never "-0". */
function num(v: number): string {
  return v === 0 ? "0" : String(v);
}

/** A rectangle in a frame's pixels, its corners rounded by `q`, closing
 *  exactly whatever the rounding. */
function sceneRect(q: (v: number) => number, x: number, y: number, w: number, h: number): string {
  return `M${num(q(x))} ${num(q(y))}H${num(q(x + w))}V${num(q(y + h))}H${num(q(x))}z`;
}

/** A disc in a frame's pixels, rounded by `q`. */
function sceneDisc(q: (v: number) => number, cx: number, cy: number, r: number): string {
  const rr = Math.max(q(r), 0.1);
  const x0 = q(cx) - rr;
  return `M${num(q(x0))} ${num(q(cy))}a${num(rr)} ${num(rr)} 0 1 0 ${num(q(2 * rr))} 0a${num(rr)} ${num(rr)} 0 1 0 ${num(-q(2 * rr))} 0z`;
}

/**
 * A run of panes of one height drawn as one stroke: each a stroke as wide
 * as the pane is high, along its middle, as long as it is wide, reached by a
 * move from the last — the same rectangle a filled path draws, in half the
 * characters, so a night's lit facade stays inside a card's few kilobytes.
 */
function strokes(): { add: (x: number, mid: number, w: number) => void; d: () => string } {
  let d = "";
  let px = 0;
  let py = 0;
  return {
    add(x, mid, w) {
      const [rx, ry, rw] = [at1(x), at1(mid), at1(w)];
      d += d ? `m${f(rx - px)} ${f(ry - py)}h${f(rw)}` : `M${f(rx)} ${f(ry)}h${f(rw)}`;
      px = rx + rw;
      py = ry;
    },
    d: () => d,
  };
}

/** Stroked panes, in one colour. */
function stroked(colour: string, height: number, d: string, extra = ""): string {
  return d ? `<path fill="none" stroke="${colour}"${extra} stroke-width="${f(height)}" d="${d}"/>` : "";
}

/** What a kind's drawing has to hand: its colours, its draws, its size. */
interface Kit {
  t: CoverTone;
  /** the deal's draw of the building's form: its storeys, bays, crown */
  form: () => number;
  /** the deal's draw of which windows are lit */
  rand: () => number;
  small: boolean;
  /** the lit windows so far, drawn over the panes: those lit by a lamp at
   *  the glass, and those lit from deeper in the room, one stroke (`strokes`)
   *  a colour and a pane's height */
  lit: Map<string, { colour: string; h: number; pen: ReturnType<typeof strokes> }>;
  /** how many of the evening's lit windows the hour lights (`LIT`) */
  litScale: number;
}

/** The windows lit at each hour against the evening's: most of them at
 *  night, a few in the morning. */
const LIT: Record<CoverTime, number> = { dusk: 1, night: 2.4, morning: 0.35 };
/** No more of a facade than this is ever lit, even at night. */
const MOST_LIT = 0.7;

/** One of `options`, by the deal's own draw of its building's form, so two
 *  deals of one kind are two buildings. */
function pick<T>(k: Kit, options: readonly T[]): T {
  return options[Math.min(options.length - 1, Math.floor(k.form() * options.length))];
}

/**
 * A grid of windows: `cols` × `rows` panes `w` × `h` from (x, y), a pitch
 * apart. The panes are one dashed stroke a row, the cheapest way to draw a
 * facade; about `lit` of them are lit, at the deal's own places.
 */
function grid(k: Kit, x: number, y: number, cols: number, rows: number, w: number, h: number, px: number, py: number, face: 0 | 1, lit: number): string {
  if (cols < 1 || rows < 1) return "";
  const len = (cols - 1) * px + w;
  const share = Math.min(MOST_LIT, lit * k.litScale);
  const lamp = litPen(k, k.t.glow[0], h);
  const room = litPen(k, k.t.glow[1], h);
  let d = "";
  for (let r = 0; r < rows; r++) {
    d += `M${f(x)} ${f(y + r * py + h / 2)}h${f(len)}`;
    for (let c = 0; c < cols; c++) {
      const p = k.rand();
      if (p < share * 0.7) lamp.add(x + c * px, y + r * py + h / 2, w);
      else if (p < share) room.add(x + c * px, y + r * py + h / 2, w);
    }
  }
  return `<path fill="none" stroke="${k.t.pane[face]}" stroke-width="${f(h)}" stroke-dasharray="${f(w)} ${f(px - w)}" d="${d}"/>`;
}

/** The pen a colour's lit windows of one height are drawn with. */
function litPen(k: Kit, colour: string, h: number): ReturnType<typeof strokes> {
  const key = `${colour} ${f(h)}`;
  let e = k.lit.get(key);
  if (!e) {
    e = { colour, h, pen: strokes() };
    k.lit.set(key, e);
  }
  return e.pen;
}

/** The lit windows gathered so far, drawn now: those lit from deep in the
 *  room first, the lamps at the glass over them. */
function lights(k: Kit): string {
  let out = "";
  for (const colour of [k.t.glow[1], k.t.glow[0]]) {
    for (const e of k.lit.values()) if (e.colour === colour) out += stroked(e.colour, e.h, e.pen.d());
  }
  k.lit.clear();
  return out;
}

/**
 * A volume standing on the ground (or on `base`): its front face lit, the
 * edge toward the sun catching it, its side face in shade, the parapet's
 * edge catching the light.
 */
function block(k: Kit, x: number, w: number, h: number, side: number, base = 0): string {
  const top = base - h;
  return (
    fill("url(#f)", R(x, top, w, h)) +
    fill(k.t.rim, R(x, top, 0.7, h), ` fill-opacity="0.45"`) +
    (side > 0 ? fill(k.t.shade, R(x + w, top, side, h)) + fill(k.t.pane[1], R(x + w, top - 1, side + 0.4, 1)) : "") +
    fill(k.t.rim, R(x - 0.4, top - 1, w + 0.4, 1))
  );
}

/** A round tree, its crown two overlapping discs. */
function tree(k: Kit, x: number, r: number): string {
  return fill(k.t.tree, R(x - r * 0.1, -r * 1.2, r * 0.2, r * 1.2) + disc(x, -r * 1.9, r) + disc(x + r * 0.45, -r * 1.35, r * 0.75));
}

/** A street lamp: its post, and its light. */
function lamp(k: Kit, x: number, h: number): string {
  return fill(k.t.tree, R(x - 0.3, -h, 0.6, h) + R(x - 0.3, -h, 2.4, 0.6)) + fill(k.t.glow[0], disc(x + 2.1, -h + 1.1, 0.9));
}

/** A kind's drawing: its width and height, and the markup, standing on
 *  y = 0 with its left edge at x = 0, in its own units. */
interface Art {
  w: number;
  h: number;
  svg: string;
}

// ── The kinds ───────────────────────────────────────────────────────────────

/** An apartment block of four to six storeys under a parapet, balconies
 *  down its face or none, its entrance lit, a tree either side, one or none. */
function housing(k: Kit): Art {
  const { t, small } = k;
  const floors = pick(k, [4, 5, 6]);
  const bays = pick(k, [4, 5, 6]);
  const balconies = pick(k, ["alternate", "all", "none"] as const);
  const side = pick(k, [16, 20, 24]);
  // Drawn last, so the block itself is the draw it always was.
  const trees = pick(k, ["both", "left", "right", "none"] as const);
  if (small) {
    // Three bays of larger windows, a storey fewer.
    const top = -(10 + (floors - 1) * 11.5);
    let s = block(k, 0, 58, -top, side * 0.9) + block(k, 34, 12, 5, 4, top);
    s += grid(k, 5, top + 3, 3, floors - 1, 10, 7.5, 18.5, 11.5, 0, 0.26);
    s += grid(k, 58 + (side * 0.9 - (side >= 20 ? 12.5 : 4)) / 2, top + 3, side >= 20 ? 2 : 1, floors - 1, 4, 7.5, 8.5, 11.5, 1, 0.2);
    s += lights(k) + fill(t.glow[0], R(24.5, -8.5, 9, 8.5));
    return { w: 58 + side * 0.9, h: 6 - top, svg: s };
  }
  const X = 10;
  const w = 11 * bays + 4;
  const top = -(12 + floors * 10.5);
  const door = Math.floor(bays / 2);
  let s = block(k, X, w, -top, side) + block(k, X + w * 0.62, 12, 5, 4, top);
  s += grid(k, X + 4.5, top + 2.5, bays, floors, 6, 5.6, 11, 10.5, 0, 0.22);
  s += grid(k, X + 4.5, -8.5, door, 1, 6, 5, 11, 1, 0, 0.3);
  s += grid(k, X + 15.5 + door * 11, -8.5, bays - door - 1, 1, 6, 5, 11, 1, 0, 0.3);
  s += grid(k, X + w + (side - (side >= 20 ? 11.2 : 3.2)) / 2, top + 2.5, side >= 20 ? 2 : 1, floors + 1, 3.2, 5.6, 8, 10.5, 1, 0.18);
  s += lights(k);
  let rails = "";
  for (let r = 1; r < floors; r++) {
    for (let c = 0; c < bays; c++) if (balconies === "all" || (balconies === "alternate" && c % 2 === 0)) rails += R(X + 3.5 + c * 11, top + r * 10.5 + 6.3, 8, 2.4);
  }
  s += fill(t.shade, rails);
  const dx = X + 4 + door * 11;
  s += fill(t.glow[0], R(dx, -9, 7, 9)) + fill(t.shade, R(dx - 3, -11, 13, 1.4));
  if (trees === "both" || trees === "left") s += tree(k, 4, 6.5);
  if (trees === "both" || trees === "right") s += tree(k, X + w + side + 4, 5.5);
  return { w: X + w + side + 10, h: 6 - top, svg: s };
}

/** A house, its gable to the street, beside a manufactured home long and
 *  low on its skirting, its porch under an awning; which stands first is
 *  the deal's own. */
function homes(k: Kit): Art {
  const { t, small } = k;
  const houseFirst = pick(k, [true, false]);
  const lit = pick(k, [0, 1, 2]);
  // The house: its gable wall lit, its side wall and roof turned away.
  const house = (x: number) =>
    fill("url(#f)", R(x, -18, 24, 18) + poly([x, -18], [x + 12, -30], [x + 24, -18])) +
    fill(t.shade, R(x + 24, -18, 16, 18)) +
    fill(t.pane[1], poly([x + 12, -30], [x + 24, -18], [x + 40, -18], [x + 28, -30]) + R(x + 30, -35, 3.4, 7)) +
    fill(t.rim, poly([x - 1.2, -17.4], [x + 12, -31.2], [x + 25.2, -17.4], [x + 24, -17.4], [x + 12, -29.6], [x, -17.4])) +
    fill(t.pane[0], R(x + 3, -13, 4.5, 5) + R(x + 16.5, -13, 4.5, 5) + R(x + 9.5, -11, 5, 11)) +
    fill(t.pane[1], R(x + 28, -13, 3, 5) + R(x + 34, -13, 3, 5)) +
    fill(t.glow[0], (lit === 0 ? R(x + 3, -13, 4.5, 5) : lit === 1 ? R(x + 16.5, -13, 4.5, 5) : R(x + 34, -13, 3, 5)) + disc(x + 12, -23, 2));
  if (small) return { w: 40, h: 35, svg: house(0) };
  // The manufactured home: long and low under a shallow roof, its end a low
  // gable, on its skirting, its door under a small awning.
  const home = (x: number) => {
    let s = fill("url(#f)", R(x, -14, 44, 11));
    s += fill(t.shade, R(x + 44, -14, 6, 11) + poly([x + 44, -14], [x + 50, -14], [x + 47, -17.2]));
    s += fill(t.pane[1], poly([x - 1.5, -14], [x + 44, -14], [x + 47, -17.2], [x + 1.5, -17.2]) + R(x, -3, 50, 3));
    s += fill(t.rim, R(x - 1.5, -14.4, 45.5, 0.8));
    s += grid(k, x + 3, -11.2, 5, 1, 5, 4.6, 8.4, 1, 0, 0.35) + lights(k);
    s += fill(t.pane[0], R(x + 22.2, -11.8, 4.6, 8.8)) + fill(t.accent, poly([x + 20.4, -13], [x + 28.6, -13], [x + 29.8, -11.2], [x + 19.2, -11.2]));
    return s + fill(t.tree, R(x + 20.5, -3, 8, 1) + R(x + 21.5, -2, 6, 2));
  };
  const svg = houseFirst ? house(0) + tree(k, 45, 7) + home(50) : home(1.5) + tree(k, 57, 7) + house(62);
  return { w: 102, h: 35, svg };
}

/** An office tower's curtain wall, fifteen to twenty-one storeys, over a low
 *  wing or standing alone, its crown set back, a mast, or flat. */
function office(k: Kit): Art {
  const { t, small } = k;
  const floors = pick(k, [15, 18, 21]);
  const crown = pick(k, ["setback", "mast", "flat"] as const);
  const wing = pick(k, [true, true, false]);
  const X = small ? 0 : 8;
  let s = "";
  // The wing: ribbon windows, its side hidden by the tower.
  if (wing) {
    s += fill("url(#f)", R(X, -42, 32, 42)) + fill(t.rim, R(X - 0.4, -43, 32.4, 1));
    s += small ? grid(k, X + 2.5, -37, 4, 3, 6, 7, 7.4, 11.8, 0, 0.18) : grid(k, X + 1.5, -37, 5, 4, 5, 4.4, 6, 8.8, 0, 0.14);
  }
  // The tower and its crown.
  const T = wing ? X + 28 : X;
  const rows = small ? Math.round(floors / 2) : floors;
  const Ht = small ? rows * 10 + 8 : floors * 4.9 + 10;
  s += block(k, T, 38, Ht, 15);
  let crest = 0;
  if (crown === "setback") {
    s += block(k, T + 4, 30, 6, 5, -Ht) + fill(t.tree, R(T + 18.6, -Ht - 21, 0.8, 15));
    crest = 21;
  } else if (crown === "mast") {
    s += fill(t.pane[1], R(T + 14, -Ht - 3, 10, 3)) + fill(t.tree, R(T + 18.5, -Ht - 18, 1, 15));
    crest = 18;
  }
  s += small ? grid(k, T + 2.6, 4 - Ht, 4, rows, 7, 6.6, 8.6, 10, 0, 0.14) : grid(k, T + 1.9, 4 - Ht, 7, floors, 4.2, 3.4, 5, 4.9, 0, 0.1);
  s += small ? grid(k, T + 41, 4 - Ht, 2, rows, 3.4, 6.6, 6.6, 10, 1, 0.1) : grid(k, T + 41, 4 - Ht, 2, floors, 3, 3.4, 6.6, 4.9, 1, 0.08);
  s += lights(k);
  s += fill(t.glow[0], R(T + 3, -6.5, 32, 6.5)) + fill(t.shade, R(T + 18.7, -6.5, 0.6, 6.5));
  if (!small) s += lamp(k, 2, 16);
  return { w: T + 53, h: Ht + Math.max(crest, 1), svg: s };
}

/** A distribution warehouse: long and low, four to six dock doors in a row,
 *  one of them open and lit, its office at the end all glass. */
function industrial(k: Kit): Art {
  const { t, small } = k;
  const doors = small ? 3 : pick(k, [4, 5, 6]);
  const w = 26 + doors * 13.5 + 2;
  let s = block(k, 0, w, 24, small ? 10 : 16) + block(k, 0, 22, 4, 0, -24);
  s += fill(t.pane[0], R(2, -24, 18, 20));
  s += grid(k, 3.5, -22.5, 3, 3, 3.8, 4.4, 5.3, 6.2, 0, 0.45);
  s += grid(k, 28, -21, Math.floor((w - 30) / 6), 1, 4, 2.6, 6, 1, 0, 0.3);
  s += lights(k);
  s += fill(t.rim, R(1, -4, 20, 1)) + fill(t.shade, R(26, -13.6, doors * 13.5 - 2, 1));
  let door = "";
  for (let i = 0; i < doors; i++) door += R(28 + i * 13.5, -12, 9.5, 12);
  s += fill(t.shade, door);
  const ribs = f(doors * 13.5 - 4);
  s += `<path fill="none" stroke="${t.lit[1]}" stroke-width="0.6" stroke-dasharray="9.5 4" d="M28 -9h${ribs}M28 -6h${ribs}M28 -3h${ribs}"/>`;
  s += fill(t.glow[0], R(28 + Math.floor(k.rand() * doors) * 13.5, -12, 9.5, 12));
  if (!small) s += lamp(k, w + 20, 20);
  return { w: w + (small ? 10 : 24), h: 29, svg: s };
}

/** A storefront of four to six bays under a striped awning, its windows lit,
 *  its sign band blank, a street lamp at the curb. */
function retail(k: Kit): Art {
  const { t, small } = k;
  const bays = small ? 4 : pick(k, [4, 5, 6]);
  const X = small ? 3 : 10;
  const w = bays * 11.8 + 5;
  const mid = X + w / 2;
  let s = block(k, X, w, 30, 14);
  s += fill(t.rim, R(X + 3, -28, w - 6, 5));
  s += grid(k, X + 5, -20.5, bays, 1, 6.5, 5.5, 11.8, 1, 0, 0.4);
  s += grid(k, X + w + 3, -20.5, 2, 1, 3, 5.5, 6, 1, 1, 0.3);
  s += lights(k);
  // The awning, striped, projecting over the windows.
  const n = 2 * Math.round(w / 12) + 1;
  let a = "";
  let b = "";
  for (let i = 0; i < n; i++) {
    const [t0, t1] = [i / n, (i + 1) / n];
    const d = poly([X + w * t0, -13.4], [X + w * t1, -13.4], [X - 3 + (w + 6) * t1, -9], [X - 3 + (w + 6) * t0, -9]);
    if (i % 2 === 0) a += d;
    else b += d;
  }
  s += fill(t.accent, a) + fill(t.rim, b) + fill(t.shade, R(X, -9, w, 1.2));
  // The shop windows either side of the door, each in three lights.
  const pane = mid - 4 - (X + 3);
  s += fill(t.glow[0], R(X + 3, -7.8, pane, 6.3) + R(mid + 4, -7.8, pane, 6.3));
  let mullions = "";
  for (const x0 of [X + 3, mid + 4]) for (const q of [1, 2]) mullions += R(x0 + (pane * q) / 3 - 0.3, -7.8, 0.6, 6.3);
  s += fill(t.shade, mullions);
  s += fill(t.pane[0], R(mid - 3.5, -8, 7, 8)) + fill(t.pane[1], R(X, -1.5, w, 1.5));
  if (small) return { w: X + w + 14, h: 31, svg: s };
  s += lamp(k, 4, 24) + tree(k, X + w + 22, 5);
  return { w: X + w + 30, h: 31, svg: s };
}

/** A hotel's slab of ten to fourteen storeys, many of its rooms lit, its
 *  sign bar glowing on the roof and its entrance canopy over a lit lobby. */
function hotel(k: Kit): Art {
  const { t, small } = k;
  const floors = pick(k, [10, 12, 14]);
  const bays = small ? 4 : pick(k, [5, 6, 7]);
  const X = small ? 0 : 8;
  const w = small ? 40 : bays * 6.1 + 3.3;
  const rows = small ? Math.round(floors / 2) + 1 : floors;
  const top = -(small ? rows * 10.4 + 10.6 : floors * 6.4 + 11.2);
  let s = block(k, X, w, -top, 14);
  s += fill(t.tree, R(X + 9, top - 6, 0.9, 6) + R(X + w - 10, top - 6, 0.9, 6)) + fill(t.glow[0], R(X + 5, top - 11.5, w - 9.1, 5.5));
  s += small ? grid(k, X + 3.5, top + 5, 4, rows, 5, 5.4, 9.3, 10.4, 0, 0.36) : grid(k, X + 3.7, top + 4, bays, floors, 3.4, 3.8, 6.1, 6.4, 0, 0.32);
  s += small ? grid(k, X + w + 3, top + 5, 2, rows, 3, 5.4, 6, 10.4, 1, 0.25) : grid(k, X + w + 2.8, top + 4, 2, floors, 2.2, 3.8, 6, 6.4, 1, 0.22);
  s += lights(k);
  const c = X + w / 2;
  s += fill(t.glow[0], R(c - 9, -8, 18, 8)) + fill(t.shade, R(c - 14, -10.5, 28, 2)) + fill(t.rim, R(c - 14, -10.5, 28, 0.6));
  s += fill(t.tree, R(c - 12.5, -8.5, 0.8, 8.5) + R(c + 11.7, -8.5, 0.8, 8.5));
  if (small) return { w: X + w + 14, h: 12 - top, svg: s };
  s += tree(k, 3, 5);
  return { w: X + w + 14, h: 12 - top, svg: s };
}

/** A self-storage building: a row of seven to nine roll-up doors in the
 *  accent colour, its office at the end lit behind glass. */
function storage(k: Kit): Art {
  const { t, small } = k;
  const doors = small ? 4 : pick(k, [7, 8, 9]);
  const pitch = small ? 11 : 9.6;
  const dw = small ? 8 : 7;
  const w = 22 + doors * pitch + 1;
  let s = block(k, 0, w, 16, small ? 8 : 12) + block(k, 0, 19, 4, 0, -16);
  s += fill(t.pane[0], R(2, -16, 15, 13)) + fill(t.glow[0], R(2.8, -9.4, 13.4, 6.4)) + fill(t.shade, R(9.2, -16, 0.6, 13) + R(2, -10, 15, 0.6));
  s += fill(t.rim, R(-0.8, -3, 20.6, 1));
  s += fill(t.shade, R(21, -12.6, w - 22, 1));
  let door = "";
  for (let i = 0; i < doors; i++) door += R(23 + i * pitch, -11, dw, 11);
  s += fill(t.accent, door);
  const ribs = f(doors * pitch);
  s += `<path fill="none" stroke="${t.shade}" stroke-opacity="0.35" stroke-width="0.5" stroke-dasharray="${f(dw)} ${f(pitch - dw)}" d="M23 -8h${ribs}M23 -5h${ribs}M23 -2h${ribs}"/>`;
  return { w: w + (small ? 8 : 12), h: 21, svg: s };
}

/** A pair of plain buildings, the taller behind, their heights the deal's
 *  own: the drawing for a class with none of its own. */
function building(k: Kit): Art {
  const { small } = k;
  const back = pick(k, [9, 11, 13]);
  const front = pick(k, [5, 6, 7]);
  const hb = back * 6.4 + 5.6;
  const hf = front * 6.6 + 6.4;
  let s = block(k, 26, 26, hb, 10);
  s += small ? grid(k, 29, 5 - hb, 3, Math.round(back * 0.64), 5, 6, 7.6, 9.6, 0, 0.2) : grid(k, 29, 4 - hb, 4, back, 3.6, 4.2, 5.6, 6.4, 0, 0.18);
  s += small ? grid(k, 54.5, 5 - hb, 1, Math.round(back * 0.64), 3, 6, 5, 9.6, 1, 0.15) : grid(k, 54.4, 4 - hb, 2, back, 2, 4.2, 4.2, 6.4, 1, 0.12);
  s += block(k, 0, 30, hf, 9);
  s += small ? grid(k, 3.5, 5 - hf, 3, Math.round(front * 0.64), 5.6, 6, 8.8, 9.8, 0, 0.22) : grid(k, 3.4, 4 - hf, 4, front, 4, 4.2, 6.6, 6.6, 0, 0.2);
  s += small ? grid(k, 32.5, 5 - hf, 1, Math.round(front * 0.64), 3, 6, 5, 9.8, 1, 0.15) : grid(k, 32.2, 4 - hf, 2, front, 1.8, 4.2, 3.8, 6.6, 1, 0.12);
  s += lights(k);
  s += fill(k.t.glow[0], R(11, -7, 8, 7));
  if (small) return { w: 62, h: hb + 1, svg: s };
  s += tree(k, 68, 6);
  return { w: 76, h: hb + 1, svg: s };
}

const KINDS: Record<Exclude<CoverKind, "land">, (k: Kit) => Art> = {
  housing,
  homes,
  office,
  industrial,
  retail,
  hotel,
  storage,
  building,
};

/** How much of the frame's width a kind may take: the long, low ones more,
 *  but never so much that a wide frame has no sky beside them for the sun. */
const SPAN: Record<CoverKind, number> = {
  housing: 0.62,
  homes: 0.74,
  office: 0.6,
  industrial: 0.76,
  retail: 0.66,
  hotel: 0.6,
  storage: 0.76,
  land: 1,
  building: 0.6,
};

/** What stands on the horizon behind a kind: a distant city, or hills and
 *  a line of trees where a city would be wrong. */
const HILLS: ReadonlySet<CoverKind> = new Set(["homes", "storage", "land"]);

/** The kinds a street of lower buildings stands beside (`coverDraw`'s
 *  neighbours): never a self-storage yard, whose neighbours are its trees,
 *  and never the land. A house's neighbour is a house. */
const STREET: ReadonlySet<CoverKind> = new Set(["housing", "homes", "office", "industrial", "retail", "hotel", "building"]);

/** The sun's size at each hour against the evening's: the moon smaller. */
const SUN_SIZE: Record<CoverTime, number> = { dusk: 1, night: 0.75, morning: 0.85 };
/** The share of the street's windows lit at each hour. */
const STREET_LIT: Record<CoverTime, number> = { dusk: 0.14, night: 0.5, morning: 0.04 };
/** The share of the distant city's blocks with a window lit at each hour. */
const CITY_LIT: Record<CoverTime, number> = { dusk: 0.6, night: 0.8, morning: 0.25 };

// ── The scene ───────────────────────────────────────────────────────────────

/** A box in the frame's pixels. */
export interface CoverBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A distant skyline along the horizon, blocks of the deal's own heights,
 *  a window lit here and there, most of them at night: the blocks as one
 *  stepped outline, and the lit windows, each `pane` wide and 1.3 panes
 *  high, as one stroke (`strokes`). */
function skyline(W: number, H: number, gY: number, rand: () => number, small: boolean, litChance: number): [string, string, number] {
  // In whole pixels on a large frame: a distant block's edge a tenth of a
  // pixel over is nothing anyone sees there, and it is a card's characters.
  const n = small ? f : (v: number) => String(Math.round(v));
  const foot = gY + 1;
  let x = -W * 0.02;
  let d = `M${n(x)} ${n(foot)}`;
  const lit = strokes();
  const pane = H * 0.008;
  while (x < W) {
    const w = W * (small ? 0.09 + rand() * 0.08 : 0.035 + rand() * 0.06);
    const h = H * (0.035 + rand() * (small ? 0.08 : 0.1));
    d += `V${n(gY - h)}H${n(x + w)}`;
    if (!small && rand() < litChance) lit.add(x + pane + rand() * (w - 3 * pane), gY - h + pane * 2 + rand() * (h - pane * 5) + pane * 0.65, pane);
    const gap = rand() < 0.3 ? W * 0.012 : 0;
    if (gap) d += `V${n(foot)}H${n(x + w + gap)}`;
    x += w + gap;
  }
  return [`${d}V${n(foot)}z`, lit.d(), pane * 1.3];
}

/** Rolling hills along the horizon, `n` crests of the deal's own heights. */
function hills(W: number, gY: number, lift: number, n: number, rand: () => number): string {
  let d = `M0 ${f(gY + 1)}L0 ${f(gY - lift * (0.4 + rand() * 0.6))}`;
  const step = W / n;
  for (let i = 0; i < n; i++) {
    const x = (i + 1) * step;
    d += `Q${f(x - step / 2)} ${f(gY - lift * (0.8 + rand() * 0.9))} ${f(x)} ${f(gY - lift * (0.3 + rand() * 0.5))}`;
  }
  return `${d}L${f(W)} ${f(gY + 1)}z`;
}

/** A line of distant trees along the horizon: three rows of round crowns,
 *  each row one dotted stroke (a zero-length dash with a round cap is a
 *  disc), set off from each other by the deal's own draw. */
function treeline(t: CoverTone, W: number, gY: number, size: number, rand: () => number): string {
  let s = fill(t.tree, R(0, gY - size * 0.7, W, size * 0.7 + 1), ` fill-opacity="0.75"`);
  for (const [k, lift, pitch] of [
    [1, 0.75, 1.3],
    [0.8, 1.15, 1.7],
    [0.62, 1.45, 2.3],
  ] as const) {
    const d = size * 2 * k;
    s += `<path fill="none" stroke="${t.tree}" stroke-opacity="0.75" stroke-width="${f(d)}" stroke-linecap="round" stroke-dasharray="0 ${f(d * pitch)}" d="M${f(-rand() * d)} ${f(gY - size * lift)}h${f(W + 2 * d)}"/>`;
  }
  return s;
}

/**
 * A lower building beside the subject, in shade (`coverDraw`'s neighbours):
 * its face, rows of dark windows and a few lit, most of them at night. A
 * house's gable where the street is homes. Its outline in the scene's
 * rounding (`scenePx`), its windows in tenths, where the lit ones lie over
 * them.
 */
function neighbour(t: CoverTone, n: CoverBox, H: number, rand: () => number, lit: number, house: boolean, q: (v: number) => number): string {
  const eave = n.y + n.h * 0.4;
  let s = fill(t.pane[0], neighbourOutline(q, n, house));
  // Its windows: a dashed stroke a row, a few of them lit.
  const pw = Math.max(1.5, n.w * 0.11);
  const ph = H * 0.022;
  const px = pw * 2.2;
  const py = H * 0.06;
  const top = (house ? eave : n.y) + H * 0.03;
  const cols = Math.max(1, Math.floor((n.w - pw * 1.5) / px) + 1);
  const rows = Math.max(1, Math.floor((n.y + n.h - top - H * 0.035) / py) + 1);
  const x0 = n.x + (n.w - (cols - 1) * px - pw) / 2;
  let d = "";
  const on = strokes();
  for (let r = 0; r < rows; r++) {
    const y = top + r * py;
    d += `M${f(x0)} ${f(y + ph / 2)}h${f((cols - 1) * px + pw)}`;
    for (let c = 0; c < cols; c++) if (rand() < lit) on.add(x0 + c * px, y + ph / 2, pw);
  }
  s += `<path fill="none" stroke="${t.pane[1]}" stroke-width="${f(ph)}" stroke-dasharray="${f(pw)} ${f(px - pw)}" d="${d}"/>`;
  return s + stroked(t.glow[1], ph, on.d());
}

/** A neighbour's outline: a block, or a house under its gable. */
function neighbourOutline(q: (v: number) => number, n: CoverBox, house: boolean): string {
  if (!house) return sceneRect(q, n.x, n.y, n.w, n.h);
  const eave = n.y + n.h * 0.4;
  return (
    sceneRect(q, n.x, eave, n.w, n.y + n.h - eave) +
    `M${num(q(n.x - 1))} ${num(q(eave))}L${num(q(n.x + n.w / 2))} ${num(q(n.y))}L${num(q(n.x + n.w + 1))} ${num(q(eave))}z`
  );
}

/** A round tree standing on the ground line, in the frame's pixels, as
 *  path data: the street's, in front of the buildings. */
function streetTree(q: (v: number) => number, x: number, gY: number, r: number): string {
  return sceneRect(q, x - r * 0.1, gY - r * 1.2, r * 0.2, r * 1.2) + sceneDisc(q, x, gY - r * 1.9, r) + sceneDisc(q, x + r * 0.45, gY - r * 1.35, r * 0.75);
}

/** The stars over a night's sky: three rows of dots, each row one dotted
 *  stroke whose gaps are the deal's own, so no two rows keep one pitch. */
function stars(t: CoverTone, W: number, H: number, rand: () => number): string {
  const gaps = Array.from({ length: 6 }, () => `0 ${Math.round(W * (0.05 + rand() * 0.12))}`).join(" ");
  let d = "";
  for (const row of [0.07, 0.15, 0.23]) d += `M${num(Math.round(-rand() * W * 0.15))} ${Math.round(H * (row + rand() * 0.03))}h${Math.round(W * 1.2)}`;
  return `<path fill="none" stroke="${t.sun}" stroke-opacity="0.7" stroke-width="${f(Math.max(1.2, H / 240))}" stroke-linecap="round" stroke-dasharray="${gaps}" d="${d}"/>`;
}

/** The land: a field furrowed toward the horizon, a staked parcel on it of
 *  the deal's own size and place, its survey flag at one far corner, trees
 *  on the horizon — drawn in the frame's own terms, since it lies on the
 *  ground. On a small frame it is drawn whole and bold (research pass 29):
 *  at a list row's 48px the parcel's dashes and stakes were finer than a
 *  pixel, and the land read as a dark band under a sun. */
function land(t: CoverTone, W: number, H: number, gY: number, rand: () => number, small: boolean): string {
  const u = H / 100;
  let s = fill("url(#h)", hills(W, gY, 10 * u, small ? 3 : 5, rand));
  s += fill(t.tree, hills(W, gY, 5 * u, small ? 2 : 4, rand));
  const cx = W * ((small ? 0.5 : 0.56) + (rand() - 0.5) * 0.08);
  if (small) {
    // The furrows, a pale parcel outlined whole in one stroke, and a survey
    // flag on the parcel's far corner away from the sun, as large as the
    // field allows: a pixel's line at 48px.
    const line = Math.max(1, 2.4 * u);
    let furrows = "";
    for (let i = -3; i <= 3; i++) furrows += `M${f(cx + i * W * 0.04)} ${f(gY)}L${f(cx + i * W * 0.34)} ${f(H)}`;
    s += `<path fill="none" stroke="${t.haze}" stroke-opacity="0.3" stroke-width="${f(line * 0.6)}" d="${furrows}"/>`;
    const near = H - 8 * u;
    const far = gY + 10 * u;
    const hw = W * 0.4;
    s += `<path fill="${t.sun}" fill-opacity="0.2" stroke="${t.rim}" stroke-width="${f(line)}" stroke-linejoin="round" d="${poly([cx - hw * 0.55, far], [cx + hw * 0.55, far], [cx + hw, near], [cx - hw, near])}"/>`;
    const fx = cx + hw * 0.55;
    s += fill(t.rim, R(fx - line / 2, far - 32 * u, line, 32 * u));
    s += fill(t.accent, poly([fx + line / 2, far - 32 * u], [fx + 22 * u, far - 25 * u], [fx + line / 2, far - 18 * u]));
    return s;
  }
  // The furrows, running to the horizon behind the parcel.
  let furrows = "";
  for (let i = -8; i <= 8; i++) furrows += `M${f(cx + i * W * 0.012)} ${f(gY)}L${f(cx + i * W * 0.16)} ${f(H)}`;
  s += `<path fill="none" stroke="${t.haze}" stroke-opacity="0.12" stroke-width="${f(0.35 * u)}" d="${furrows}"/>`;
  // The parcel, in perspective: its near edge low in the frame.
  const near = gY + 10 * u;
  const far = gY + 2.4 * u;
  const hw = W * (0.21 + rand() * 0.07);
  const pts: [number, number][] = [
    [cx - hw * 0.6, far],
    [cx + hw * 0.6, far],
    [cx + hw, near],
    [cx - hw, near],
  ];
  const edge = `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}z`;
  s += `<path fill="${t.sun}" fill-opacity="0.08" stroke="${t.rim}" stroke-opacity="0.8" stroke-width="${f(0.5 * u)}" stroke-dasharray="${f(1.8 * u)} ${f(1.3 * u)}" d="${edge}"/>`;
  let stakes = "";
  let ribbons = "";
  for (const [x, y] of pts) {
    const h = (y === near ? 5 : 3.2) * u;
    stakes += R(x - 0.35 * u, y - h, 0.7 * u, h);
    ribbons += R(x - 0.35 * u, y - h, 1.6 * u, 0.8 * u);
  }
  // The survey flag at one of the parcel's far corners.
  const [fx, fy] = pts[rand() < 0.5 ? 1 : 0];
  stakes += R(fx - 0.4 * u, fy - 24 * u, 0.8 * u, 24 * u);
  ribbons += poly([fx + 0.4 * u, fy - 24 * u], [fx + 11 * u, fy - 20.5 * u], [fx + 0.4 * u, fy - 17 * u]);
  s += fill(t.rim, stakes) + fill(t.accent, ribbons);
  // Trees on the horizon, off to the side.
  const tx = W * 0.86;
  s += fill(
    t.tree,
    R(tx - 0.4 * u, gY - 8 * u, 0.8 * u, 8 * u) + disc(tx, gY - 11 * u, 4.5 * u) + disc(tx + 2.5 * u, gY - 8.5 * u, 3.2 * u) + disc(tx - 7 * u, gY - 5 * u, 3 * u) + R(tx - 7.3 * u, gY - 4 * u, 0.6 * u, 4 * u),
  );
  return s;
}

/** The scene's sky, refused unless the scene is one of ours: nothing but a
 *  kind this draws and six-digit hex colours ever reaches the document. */
function check(scene: CoverScene): CoverTone {
  const tone = COVER_TONES[scene.tone];
  if (!tone || !Number.isInteger(scene.tone)) throw new Error("coverSvg: no such tone");
  if (!COVER_KINDS.includes(scene.kind)) throw new Error("coverSvg: no such kind");
  for (const c of Object.values(tone).flat()) if (!HEX.test(c)) throw new Error("coverSvg: a colour is a six-digit hex");
  return tone;
}

/** Where a cover's pieces fall in its frame, in the frame's pixels, as the
 *  picture shows them: after the mirror, where the deal's draw turns it. */
export interface CoverLayout {
  /** drawn simply: a list row's square, an avatar */
  small: boolean;
  /** the horizon, where the building stands and the ground begins */
  horizon: number;
  /** the building's box (none for land, whose drawing lies on the ground) */
  building: CoverBox | null;
  /** the sun, or at night the moon */
  sun: { x: number; y: number; r: number };
  /** the lower buildings in shade beside it */
  neighbours: CoverBox[];
  /** the hour it is drawn at */
  time: CoverTime;
  /** the light from the right: the scene turned */
  mirror: boolean;
}

/** A cover's drawing and where it falls: one computation behind the layout
 *  the tests hold and the document the surfaces serve. Laid out with the
 *  light from the left, and turned as a whole where the deal's draw says. */
function compose(scene: CoverScene, width: number, height: number) {
  const t = check(scene);
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  const small = Math.min(W, H) <= SMALL_FRAME_PX;
  const seed = scene.variant >>> 0;
  const look = coverDraw(seed);
  const sunDraw = draw(seed ^ 0x5bd1e995);
  const kit: Kit = {
    t,
    form: draw(seed ^ 0x9e3779b9),
    rand: draw(seed ^ 0x165667b1),
    small,
    lit: new Map(),
    litScale: LIT[look.time],
  };
  const isLand = scene.kind === "land";
  // The horizon: on a wide frame high enough that a card's words, which
  // take a fixed height at its foot, sit on the ground even on the
  // smallest card the pipeline draws; half way down a small frame's land,
  // so its field holds the parcel and the flag whole.
  const horizon = H * (small ? (isLand ? 0.52 : 0.8) : isLand ? 0.6 : 0.72);

  // The building: as large as the sky above it and the kind's share of the
  // width allow.
  const art = scene.kind === "land" ? null : KINDS[scene.kind](kit);
  const top = H * (small ? 0.16 : 0.14);
  const span = small ? Math.min(1, SPAN[scene.kind] + 0.26) : SPAN[scene.kind];
  const scale = art ? Math.min((horizon - top) / art.h, (W * span) / art.w) : 0;
  const bw = art ? art.w * scale : 0;
  const bh = art ? art.h * scale : 0;

  // The sun — the moon at night — low on the light's side, which is the
  // left until the scene is turned; higher and smaller at night and in the
  // morning.
  const r = H * (small ? 0.075 : 0.046) * SUN_SIZE[look.time];
  let x = W * (small ? 0.2 + sunDraw() * 0.12 : 0.12 + sunDraw() * 0.18);
  const [lift, spread] = look.time === "dusk" ? [0.26, 0.13] : [0.3, 0.12];
  let y = small ? H * (0.22 + sunDraw() * 0.1) : horizon - H * (lift + sunDraw() * spread);

  // Where the building stands: on a wide frame, in the room the sun leaves
  // it, as near the sun or as far as the deal's draw says, its middle
  // between 40% and 74% of the width; a little right of centre where it is
  // too wide for that, and centred on a small frame.
  let bx = W * (small ? 0.5 : 0.56) - bw / 2;
  if (art && !small) {
    const lo = Math.max(W * 0.02, x + r * 1.8, W * 0.4 - bw / 2);
    const hi = Math.min(W * 0.98 - bw, W * 0.74 - bw / 2);
    if (lo <= hi) bx = lo + look.place * (hi - lo);
  }
  const building: CoverBox | null = art ? { x: bx, y: horizon - bh, w: bw, h: bh } : null;

  // Never sitting on a roofline: beside the building where there is room,
  // above it where there is sky, else half set behind it. On a wide frame it
  // stays clear of the top corners, where a card sets its call and its tags.
  if (building && x + r * 1.6 > building.x && y + r * 1.6 > building.y) {
    if (building.x - r * 1.8 >= W * 0.1) x = building.x - r * 1.8;
    else if (building.y - r * 2 >= H * (small ? 0.14 : 0.3)) y = building.y - r * 2;
    else y = building.y + r * 0.3;
  }

  // The street on the far side from the sun: lower buildings in shade, the
  // first standing partly behind the building, the next behind the first.
  const neighbours: CoverBox[] = [];
  if (building && !small && STREET.has(scene.kind)) {
    const nd = draw(seed ^ 0x7f4a7c15);
    let at = building.x + building.w;
    for (let i = 0; i < look.neighbours && at < W; i++) {
      const w = W * (0.09 + nd() * 0.07);
      const h = Math.max(H * 0.1, Math.min(building.h * (0.3 + nd() * 0.3), H * 0.3));
      const nx = at - w * (i === 0 ? 0.3 : 0.08);
      neighbours.push({ x: nx, y: horizon - h, w, h });
      at = nx + w;
    }
  }
  // Trees along the street: beside the building and in the open ground,
  // never as tall as the sun is low.
  const trees: { x: number; r: number }[] = [];
  if (building && !small && look.trees > 0) {
    const td = draw(seed ^ 0x2545f491);
    const spots = [building.x - W * 0.03, building.x + building.w + W * 0.035, W * (0.03 + td() * 0.05), W * (0.92 + td() * 0.05)];
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(td() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    for (const tx of spots.slice(0, look.trees)) trees.push({ x: tx, r: H * (0.035 + td() * 0.025) });
  }

  // As the picture shows it: turned where the deal's draw says.
  const turn = (b: CoverBox): CoverBox => (look.mirror ? { ...b, x: W - b.x - b.w } : b);
  const layout: CoverLayout = {
    small,
    horizon,
    building: building && turn(building),
    sun: { x: look.mirror ? W - x : x, y, r },
    neighbours: neighbours.map(turn),
    time: look.time,
    mirror: look.mirror,
  };
  const drawn = { horizon, building, sun: { x, y, r }, neighbours, trees };
  return { t, W, H, art, scale, look, layout, drawn, seed, skyDraw: draw(seed ^ 0x27d4eb2f) };
}

/** Where a cover's pieces fall in a frame of the given size. */
export function coverLayout(scene: CoverScene, width: number, height: number): CoverLayout {
  return compose(scene, width, height).layout;
}

/**
 * The cover as an SVG document, laid out for the frame it is drawn into: a
 * card's (wide, its foot kept for the card's words), an email's banner, or
 * a list row's square, where the building is drawn larger and simpler. No
 * words, no script, no style and nothing fetched: the surfaces that show it
 * name the deal beside it.
 */
export function coverSvg(scene: CoverScene, width: number, height: number): string {
  const { t, W, H, art, scale, look, layout, drawn, seed, skyDraw } = compose(scene, width, height);
  const { small } = layout;
  const { horizon: gY, building, sun, neighbours, trees } = drawn;
  const night = look.time === "night";
  const morning = look.time === "morning";

  // The sky: the evening's three bands; at night its deep tone down to its
  // middle one at the horizon; in the morning its middle tone over the pale
  // band. Laid in the frame's own pixels, so a disc painted with it is the
  // sky behind it: the moon's dark side.
  const stops: [string, number][] = night
    ? [[t.sky[0], 0.45], [t.sky[1], 1]]
    : morning
      ? [[t.sky[1], 0], [t.sky[2], 0.8]]
      : [[t.sky[0], 0], [t.sky[1], 0.55], [t.sky[2], 1]];
  // The face the light falls on: in shade itself at night.
  const face = night ? [t.lit[1], t.shade] : [t.lit[0], t.lit[1]];
  let defs =
    `<linearGradient id="k" gradientUnits="userSpaceOnUse" x2="0" y2="${f(gY + 1)}">${stops.map(([c, o]) => `<stop${o ? ` offset="${o}"` : ""} stop-color="${c}"/>`).join("")}</linearGradient>` +
    `<radialGradient id="s"><stop stop-color="${t.sun}" stop-opacity="0.6"/><stop offset="0.14" stop-color="${t.sun}" stop-opacity="0.3"/>` +
    `<stop offset="0.45" stop-color="${t.sun}" stop-opacity="0.08"/><stop offset="1" stop-color="${t.sun}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="g" x2="0" y2="1"><stop stop-color="${t.ground[0]}"/><stop offset="1" stop-color="${t.ground[1]}"/></linearGradient>` +
    `<linearGradient id="h" x2="0" y2="1"><stop stop-color="${t.haze}"/><stop offset="1" stop-color="${t.haze}" stop-opacity="0.55"/></linearGradient>` +
    `<linearGradient id="f" x2="0.35" y2="1"><stop stop-color="${face[0]}"/><stop offset="1" stop-color="${face[1]}"/></linearGradient>`;

  // The sky; at night its stars; the sun's glow across it — the moon's
  // smaller — the sun and its halo, or the moon with its dark side cut away.
  let body = `<rect width="${W}" height="${f(gY + 1)}" fill="url(#k)"/>`;
  if (night && !small) body += stars(t, W, H, skyDraw);
  body += `<circle cx="${f(sun.x)}" cy="${f(sun.y)}" r="${f(H * (night ? 0.3 : morning ? 0.5 : 0.62))}" fill="url(#s)"${night ? ` opacity="0.6"` : ""}/>`;
  if (!night) body += fill(t.sun, disc(sun.x, sun.y, sun.r * 1.45), ` fill-opacity="0.16"`);
  body += fill(t.sun, disc(sun.x, sun.y, sun.r));
  if (night) body += fill("url(#k)", disc(sun.x + sun.r * 0.45, sun.y - sun.r * 0.3, sun.r * 0.8));
  if (!small && !night) {
    // Long wisps of cloud, lit from below, fading at both ends.
    defs +=
      `<linearGradient id="c"><stop stop-color="${t.sun}" stop-opacity="0"/><stop offset="0.5" stop-color="${t.sun}" stop-opacity="0.3"/>` +
      `<stop offset="1" stop-color="${t.sun}" stop-opacity="0"/></linearGradient>`;
    for (let i = 0; i < 3; i++) {
      const cw = W * (0.2 + skyDraw() * 0.22) * (i === 2 ? 0.6 : 1);
      const cx = W * (0.06 + skyDraw() * 0.6) + (i === 2 ? W * 0.08 : 0);
      const cy = H * (i === 2 ? 0.16 : 0.1 + i * 0.14) + H * skyDraw() * 0.06;
      const ch = H * (i === 2 ? 0.012 : 0.02);
      body += `<rect x="${Math.round(cx)}" y="${Math.round(cy)}" width="${Math.round(cw)}" height="${f(ch)}" rx="${f(ch / 2)}" fill="url(#c)"/>`;
    }
  }
  body += `<rect y="${f(gY)}" width="${W}" height="${f(H - gY)}" fill="url(#g)"/>`;

  if (!art || !building) {
    body += land(t, W, H, gY, skyDraw, small);
  } else {
    // What stands on the horizon behind the building.
    if (HILLS.has(scene.kind)) {
      body += fill("url(#h)", hills(W, gY, H * 0.1, small ? 3 : 5, skyDraw)) + treeline(t, W, gY, H * (small ? 0.03 : 0.022), skyDraw);
    } else {
      const [city, lit, pane] = skyline(W, H, gY, skyDraw, small, CITY_LIT[look.time]);
      body += fill("url(#h)", city) + stroked(t.glow[0], pane, lit, ` stroke-opacity="${night ? 0.75 : 0.55}"`);
    }
    if (morning && !small) {
      // The morning's mist, low over the distance.
      defs += `<linearGradient id="v" x2="0" y2="1"><stop stop-color="${t.haze}" stop-opacity="0"/><stop offset="1" stop-color="${t.haze}" stop-opacity="0.5"/></linearGradient>`;
      body += `<rect y="${Math.round(gY - H * 0.09)}" width="${W}" height="${Math.round(H * 0.09) + 1}" fill="url(#v)"/>`;
    }
    // The street beside it: the nearer building in shade with its windows,
    // the one beyond it a silhouette in the haze, behind it.
    const q = scenePx(small);
    const windows = draw(seed ^ 0x61c88647);
    const house = scene.kind === "homes";
    for (let i = neighbours.length - 1; i >= 0; i--) {
      body += i === 0 ? neighbour(t, neighbours[i], H, windows, STREET_LIT[look.time], house, q) : fill("url(#h)", neighbourOutline(q, neighbours[i], house));
    }
    // The building, and its reflection on the ground: short and faint, gone
    // before a card's words begin.
    const fade = H * (small ? 0.12 : 0.08);
    defs +=
      `<linearGradient id="r" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></linearGradient>` +
      `<mask id="m"><rect y="${f(gY)}" width="${W}" height="${f(fade)}" fill="url(#r)"/></mask>`;
    body +=
      `<g id="b" transform="translate(${f(building.x)} ${f(gY)}) scale(${scale.toFixed(3)})">${art.svg}</g>` +
      `<g mask="url(#m)" opacity="${small ? 0.3 : 0.24}"><use href="#b" transform="matrix(1 0 0 -1 0 ${f(2 * gY)})"/></g>`;
    // The street's trees, in front of it.
    body += fill(t.tree, trees.map((tr) => streetTree(q, tr.x, gY, tr.r)).join(""));
  }
  // The ground line, catching the last of the light.
  body += fill(t.rim, R(0, gY - 0.5, W, Math.max(1, H / 320)), ` fill-opacity="${night ? 0.2 : 0.35}"`);
  // Turned as a whole where the deal's draw says: the light from the right.
  if (look.mirror) body = `<g transform="matrix(-1 0 0 1 ${W} 0)">${body}</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>`;
}

/**
 * The cover as a CSS background image, for a frame of the given shape: the
 * same document `coverSvg` serves, inline as a data URI, so a card draws its
 * cover with no request and nothing on the page can reach into it.
 */
export function coverImage(scene: CoverScene, width: number, height: number): string {
  const svg = coverSvg(scene, width, height)
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/"/g, "%22")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
  return `url("data:image/svg+xml;charset=utf-8,${svg}")`;
}
