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
// its words. The deal's tone (one of eight skies) and its variant (where the
// sun sits, which windows are lit) are drawn from its id, so a deal always
// wears the same cover and a pipeline wears many.
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
 * The eight skies, each a hue family from the evening: teal, harbour blue,
 * forest, slate, plum, brick, sea and bronze. The pipeline's cards are told
 * apart by colour, and none of them shouts over the photographs beside it.
 * The ground under every sky is deep, so a card's white words read on it
 * (held by the test).
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
];

/** What a cover is drawn from: its kind of building, its sky and its draw. */
export interface CoverScene {
  kind: CoverKind;
  /** which of `COVER_TONES` */
  tone: number;
  /** the deal's own draw of the scene's details: where the sun sits, which
   *  windows are lit */
  variant: number;
}

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

/** What a kind's drawing has to hand: its colours, its draws, its size. */
interface Kit {
  t: CoverTone;
  /** the deal's draw of the building's form: its storeys, bays, crown */
  form: () => number;
  /** the deal's draw of which windows are lit */
  rand: () => number;
  small: boolean;
  /** the lit windows so far, as path data, drawn over the panes: those lit
   *  by a lamp at the glass, and those lit from deeper in the room */
  glow: string;
  dim: string;
}

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
  let d = "";
  for (let r = 0; r < rows; r++) {
    d += `M${f(x)} ${f(y + r * py + h / 2)}h${f(len)}`;
    for (let c = 0; c < cols; c++) {
      const p = k.rand();
      if (p < lit * 0.7) k.glow += R(x + c * px, y + r * py, w, h);
      else if (p < lit) k.dim += R(x + c * px, y + r * py, w, h);
    }
  }
  return `<path fill="none" stroke="${k.t.pane[face]}" stroke-width="${f(h)}" stroke-dasharray="${f(w)} ${f(px - w)}" d="${d}"/>`;
}

/** The lit windows gathered so far, drawn now. */
function lights(k: Kit): string {
  const out = fill(k.t.glow[1], k.dim) + fill(k.t.glow[0], k.glow);
  k.glow = "";
  k.dim = "";
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
 *  down its face or none, its entrance lit, a tree either side. */
function housing(k: Kit): Art {
  const { t, small } = k;
  const floors = pick(k, [4, 5, 6]);
  const bays = pick(k, [4, 5, 6]);
  const balconies = pick(k, ["alternate", "all", "none"] as const);
  const side = pick(k, [16, 20, 24]);
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
  s += tree(k, 4, 6.5) + tree(k, X + w + side + 4, 5.5);
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

// ── The scene ───────────────────────────────────────────────────────────────

/** A distant skyline along the horizon, blocks of the deal's own heights,
 *  a window lit here and there: the path, and the lit windows' path. */
function skyline(W: number, H: number, gY: number, rand: () => number, small: boolean): [string, string] {
  let d = "";
  let lit = "";
  let x = -W * 0.02;
  const pane = H * 0.008;
  while (x < W) {
    const w = W * (small ? 0.09 + rand() * 0.08 : 0.035 + rand() * 0.06);
    const h = H * (0.035 + rand() * (small ? 0.08 : 0.1));
    d += R(x, gY - h, w, h + 1);
    if (!small && rand() < 0.6) lit += R(x + pane + rand() * (w - 3 * pane), gY - h + pane * 2 + rand() * (h - pane * 5), pane, pane * 1.3);
    x += w + (rand() < 0.3 ? W * 0.012 : 0);
  }
  return [d, lit];
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

/** The land: a field furrowed toward the horizon, a staked parcel on it of
 *  the deal's own size and place, its survey flag at one far corner, trees
 *  on the horizon — drawn in the frame's own terms, since it lies on the
 *  ground. */
function land(t: CoverTone, W: number, H: number, gY: number, rand: () => number, small: boolean): string {
  const u = H / 100;
  let s = fill("url(#h)", hills(W, gY, 10 * u, small ? 3 : 5, rand));
  s += fill(t.tree, hills(W, gY, 5 * u, small ? 2 : 4, rand));
  const cx = W * ((small ? 0.5 : 0.56) + (rand() - 0.5) * 0.08);
  // The furrows, running to the horizon behind the parcel.
  let furrows = "";
  for (let i = -8; i <= 8; i++) furrows += `M${f(cx + i * W * 0.012)} ${f(gY)}L${f(cx + i * W * 0.16)} ${f(H)}`;
  s += `<path fill="none" stroke="${t.haze}" stroke-opacity="0.12" stroke-width="${f(0.35 * u)}" d="${furrows}"/>`;
  // The parcel, in perspective: its near edge low in the frame.
  const near = gY + (small ? 12 : 10) * u;
  const far = gY + 2.4 * u;
  const hw = W * (small ? 0.36 : 0.21 + rand() * 0.07);
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
  const tx = W * (small ? 0.84 : 0.86);
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

/** Where a cover's pieces fall in its frame, in the frame's pixels. */
export interface CoverLayout {
  /** drawn simply: a list row's square, an avatar */
  small: boolean;
  /** the horizon, where the building stands and the ground begins */
  horizon: number;
  /** the building's box (none for land, whose drawing lies on the ground) */
  building: { x: number; y: number; w: number; h: number } | null;
  /** the sun */
  sun: { x: number; y: number; r: number };
}

/** A cover's drawing and where it falls: one computation behind the layout
 *  the tests hold and the document the surfaces serve. */
function compose(scene: CoverScene, width: number, height: number) {
  const t = check(scene);
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  const small = Math.min(W, H) <= SMALL_FRAME_PX;
  const seed = scene.variant >>> 0;
  const sunDraw = draw(seed ^ 0x5bd1e995);
  const kit: Kit = { t, form: draw(seed ^ 0x9e3779b9), rand: draw(seed ^ 0x165667b1), small, glow: "", dim: "" };
  const isLand = scene.kind === "land";
  // The horizon: on a wide frame high enough that a card's words, which
  // take a fixed height at its foot, sit on the ground even on the
  // smallest card the pipeline draws.
  const horizon = H * (small ? (isLand ? 0.62 : 0.8) : isLand ? 0.6 : 0.72);

  // The building: as large as the sky above it and the kind's share of the
  // width allow, a little right of centre on a wide frame.
  const art = scene.kind === "land" ? null : KINDS[scene.kind](kit);
  const top = H * (small ? 0.16 : 0.14);
  const span = small ? Math.min(1, SPAN[scene.kind] + 0.26) : SPAN[scene.kind];
  const scale = art ? Math.min((horizon - top) / art.h, (W * span) / art.w) : 0;
  const building = art
    ? { x: W * (small ? 0.5 : 0.56) - (art.w * scale) / 2, y: horizon - art.h * scale, w: art.w * scale, h: art.h * scale }
    : null;

  // The sun, low on the left; never sitting on a roofline: beside the
  // building where there is room, above it where there is sky, else half
  // set behind it. On a wide frame it stays clear of the top left, where a
  // card sets its call.
  let x = W * (small ? 0.2 + sunDraw() * 0.12 : 0.12 + sunDraw() * 0.18);
  let y = small ? H * (0.22 + sunDraw() * 0.1) : horizon - H * (0.26 + sunDraw() * 0.13);
  const r = H * (small ? 0.075 : 0.046);
  if (building && x + r * 1.6 > building.x && y + r * 1.6 > building.y) {
    if (building.x - r * 1.8 >= W * 0.1) x = building.x - r * 1.8;
    else if (building.y - r * 2 >= H * (small ? 0.14 : 0.3)) y = building.y - r * 2;
    else y = building.y + r * 0.3;
  }
  const layout: CoverLayout = { small, horizon, building, sun: { x, y, r } };
  return { t, W, H, art, scale, layout, skyDraw: draw(seed ^ 0x27d4eb2f) };
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
  const { t, W, H, art, scale, layout, skyDraw } = compose(scene, width, height);
  const { small, horizon: gY, building, sun } = layout;

  let defs =
    `<linearGradient id="k" x2="0" y2="1"><stop stop-color="${t.sky[0]}"/><stop offset="0.55" stop-color="${t.sky[1]}"/><stop offset="1" stop-color="${t.sky[2]}"/></linearGradient>` +
    `<radialGradient id="s"><stop stop-color="${t.sun}" stop-opacity="0.6"/><stop offset="0.14" stop-color="${t.sun}" stop-opacity="0.3"/>` +
    `<stop offset="0.45" stop-color="${t.sun}" stop-opacity="0.08"/><stop offset="1" stop-color="${t.sun}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="g" x2="0" y2="1"><stop stop-color="${t.ground[0]}"/><stop offset="1" stop-color="${t.ground[1]}"/></linearGradient>` +
    `<linearGradient id="h" x2="0" y2="1"><stop stop-color="${t.haze}"/><stop offset="1" stop-color="${t.haze}" stop-opacity="0.55"/></linearGradient>` +
    `<linearGradient id="f" x2="0.35" y2="1"><stop stop-color="${t.lit[0]}"/><stop offset="1" stop-color="${t.lit[1]}"/></linearGradient>`;

  // The sky, the sun's glow across it, the sun and its halo.
  let body =
    `<rect width="${W}" height="${f(gY + 1)}" fill="url(#k)"/>` +
    `<circle cx="${f(sun.x)}" cy="${f(sun.y)}" r="${f(H * 0.62)}" fill="url(#s)"/>` +
    fill(t.sun, disc(sun.x, sun.y, sun.r * 1.45), ` fill-opacity="0.16"`) +
    fill(t.sun, disc(sun.x, sun.y, sun.r));
  if (!small) {
    // Long wisps of cloud, lit from below, fading at both ends.
    defs +=
      `<linearGradient id="c"><stop stop-color="${t.sun}" stop-opacity="0"/><stop offset="0.5" stop-color="${t.sun}" stop-opacity="0.3"/>` +
      `<stop offset="1" stop-color="${t.sun}" stop-opacity="0"/></linearGradient>`;
    for (let i = 0; i < 3; i++) {
      const cw = W * (0.2 + skyDraw() * 0.22) * (i === 2 ? 0.6 : 1);
      const cx = W * (0.06 + skyDraw() * 0.6) + (i === 2 ? W * 0.08 : 0);
      const cy = H * (i === 2 ? 0.16 : 0.1 + i * 0.14) + H * skyDraw() * 0.06;
      const ch = H * (i === 2 ? 0.012 : 0.02);
      body += `<rect x="${f(cx)}" y="${f(cy)}" width="${f(cw)}" height="${f(ch)}" rx="${f(ch / 2)}" fill="url(#c)"/>`;
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
      const [city, lit] = skyline(W, H, gY, skyDraw, small);
      body += fill("url(#h)", city) + fill(t.glow[0], lit, ` fill-opacity="0.55"`);
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
  }
  // The ground line, catching the last of the light.
  body += fill(t.rim, R(0, gY - 0.5, W, Math.max(1, H / 320)), ` fill-opacity="0.35"`);

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
