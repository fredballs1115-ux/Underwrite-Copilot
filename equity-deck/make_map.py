#!/usr/bin/env python3
"""Editorial-minimal (high-end brochure) locator map for 2300 N Street, NW — West End, Washington DC.
Builds an inline-SVG HTML string, screenshots with headless Chromium, crops to exactly 2330x1600.
North is up. Numbered streets increase going WEST; lettered streets advance going NORTH."""
import os, subprocess, tempfile, math, random

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
VBW, VBH = 1165, 800

# ---- Editorial-minimal palette (muted, warm, lots of paper) --------------------
PAPER   = "#F4F1EA"   # warm ivory land
PAPER2  = "#EFEBE1"   # faint tonal panel
BLOCK   = "#DED6C5"   # building footprint fill (darker warm-gray for value contrast)
BLOCK2  = "#D6CCB8"   # alt footprint (deeper)
BLOCK3  = "#E4DDCE"   # lighter footprint for variation
BLOCKED = "#C7BCA4"   # footprint edge (stronger)
PARK    = "#DCE3D0"   # muted sage green
PARKED  = "#CBD4BC"
WATER   = "#CFDDE4"   # soft dusty blue
WATERED = "#BFD1DA"
ST_FILL = "#FFFFFF"   # street fill (hairline white)
ST_CASE = "#E4DED2"   # street casing
AVE_FILL= "#F6EFDC"   # warm avenue
AVE_CASE= "#E7DBBE"
GOLD    = "#C8A24B"   # refined muted gold
GOLD_D  = "#A9812E"   # deep gold line
GOLD_HI = "#E4C877"
INK     = "#33302A"   # warm near-black
INK_SOFT= "#6A6357"
HOOD    = "#8A8271"   # neighborhood label warm grey
STLBL   = "#B4AC9C"   # street label faint
HALO    = "#F4F1EA"   # halo = paper
METRO   = "#2A2622"
RED     = "#BF0D3E"; BLUE="#0072CE"; ORANGE="#F7941E"; SILVER="#A2A4A1"

# ---- Grid geometry (numbered N-S increase WEST; lettered E-W advance NORTH) -----
# x increases to the right; higher street numbers on LEFT.
V = [(228,"25th"),(372,"24th"),(540,"23rd"),(706,"22nd"),(864,"21st"),(1012,"20th")]
# y increases downward; letters advance NORTH so P at top, K at bottom.
H = [(138,"P St"),(252,"O St"),(370,"N St"),(490,"M St"),(608,"L St"),(710,"K St")]
GX0, GX1 = 195, 1055
GY0, GY1 = 108, 710

random.seed(7)

s = []

# ============================ BASE PAPER ========================================
s.append(f'<rect width="{VBW}" height="{VBH}" fill="{PAPER}"/>')

# ---- Rock Creek Park along WEST/left edge (organic) ----------------------------
s.append(f'<path d="M0,0 L118,0 C96,150 128,250 92,360 '
         f'C120,470 70,560 108,650 C64,720 40,760 0,780 Z" '
         f'fill="{PARK}"/>')
s.append(f'<path d="M118,0 C96,150 128,250 92,360 C120,470 70,560 108,650 C64,720 40,760 0,780" '
         f'fill="none" stroke="{PARKED}" stroke-width="1.4"/>')

# ---- Potomac River at SW / lower-left ------------------------------------------
s.append(f'<path d="M0,632 C120,662 214,712 292,800 L0,800 Z" fill="{WATER}"/>')
s.append(f'<path d="M0,632 C120,662 214,712 292,800" fill="none" stroke="{WATERED}" stroke-width="1.6"/>')

# ============================ BUILDING FOOTPRINTS ===============================
# Fill each grid cell with a subtle mass of small building blocks -> city texture.
def cell_blocks(x0, x1, y0, y1, road=7):
    """Emit small rounded footprints densely tiling a block, leaving street gutters.
    Denser + darker than before so every block reads as developed urban fabric."""
    out = []
    ix0, ix1 = x0 + road, x1 - road
    iy0, iy1 = y0 + road, y1 - road
    if ix1 - ix0 < 12 or iy1 - iy0 < 12:
        return out
    # finer subdivision -> more parcels per block (denser fabric)
    ncols = max(2, round((ix1 - ix0) / 34))
    nrows = max(2, round((iy1 - iy0) / 32))
    cw = (ix1 - ix0) / ncols
    ch = (iy1 - iy0) / nrows
    for r in range(nrows):
        for c in range(ncols):
            # rarely skip so blocks read full, not half-empty
            if random.random() < 0.05:
                continue
            pad_x = 1.4 + random.random() * 1.6
            pad_y = 1.4 + random.random() * 1.6
            bx = ix0 + c * cw + pad_x
            by = iy0 + r * ch + pad_y
            bw = cw - pad_x * 2
            bh = ch - pad_y * 2
            if bw < 6 or bh < 6:
                continue
            # weighted mix of tones: mostly mid warm-gray, some deep, some light
            rr = random.random()
            fill = BLOCK2 if rr < 0.32 else (BLOCK3 if rr > 0.82 else BLOCK)
            out.append(f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh:.1f}" '
                       f'rx="1.8" fill="{fill}" stroke="{BLOCKED}" stroke-width="0.7"/>')
    return out

# Subject parcel rect (24th–23rd & N–M). Clear footprints here so the gold reads clean.
PARCEL_X, PARCEL_W = 380, 152
PARCEL_Y, PARCEL_H = 378, 106

# Include peripheral margin bands so the WHOLE frame reads as developed fabric,
# not just the interior grid (top above P St, bottom below K St, far-east strip).
xs = [136, GX0] + [x for x, _ in V] + [GX1, 1132]
ys = [46, GY0] + [y for y, _ in H] + [GY1, 792]
xs = sorted(set(xs)); ys = sorted(set(ys))
for xi in range(len(xs) - 1):
    for yi in range(len(ys) - 1):
        cx = (xs[xi] + xs[xi + 1]) / 2
        cy = (ys[yi] + ys[yi + 1]) / 2
        # skip cells over the park (far west) so texture doesn't spill into green
        if cx < 150:
            continue
        # skip cells over the Potomac (SW / lower-left): river reaches ~x<300,y>640
        if cx < 320 and cy > 636:
            continue
        # skip the cell that holds the subject parcel (kept clear for the gold)
        if PARCEL_X - 6 < cx < PARCEL_X + PARCEL_W + 6 and PARCEL_Y - 6 < cy < PARCEL_Y + PARCEL_H + 6:
            continue
        s += cell_blocks(xs[xi], xs[xi + 1], ys[yi], ys[yi + 1])

# ============================ STREETS (hairlines) ===============================
def hline(y, x0, x1, major=False):
    w = 9 if major else 5.5
    return (f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="{ST_CASE}" stroke-width="{w+2.4}" stroke-linecap="round"/>'
            f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="{ST_FILL}" stroke-width="{w}" stroke-linecap="round"/>')
def vline(x, y0, y1, major=False):
    w = 9 if major else 5.5
    return (f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{y1}" stroke="{ST_CASE}" stroke-width="{w+2.4}" stroke-linecap="round"/>'
            f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{y1}" stroke="{ST_FILL}" stroke-width="{w}" stroke-linecap="round"/>')
def avenue(x0, y0, x1, y1):
    return (f'<line x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" stroke="{AVE_CASE}" stroke-width="12" stroke-linecap="round"/>'
            f'<line x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" stroke="{AVE_FILL}" stroke-width="8" stroke-linecap="round"/>')

for x, _ in V:
    vline(x, GY0, GY1, major=(x == 540))
    s.append(vline(x, GY0, GY1, major=(x == 540)))
for y, _ in H:
    s.append(hline(y, GX0, GX1, major=(y == 398)))

# ---- Diagonal avenues (drawn over grid) ----------------------------------------
# New Hampshire Ave SW->NE : Washington Circle (~23rd & K) up to Dupont Circle (NE)
WC = (540, 710)       # Washington Circle (23rd & K)
DUP = (992, 186)      # Dupont Circle
s.append(avenue(WC[0], WC[1], DUP[0], DUP[1]))
# Pennsylvania Ave: Washington Circle to the SE (terminate inside the frame)
PENN_END = (1030, 758)
s.append(avenue(WC[0], WC[1], PENN_END[0], PENN_END[1]))

# ---- Traffic circles -----------------------------------------------------------
def circle(cx, cy, r):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r+6}" fill="{ST_FILL}" stroke="{ST_CASE}" stroke-width="2.4"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{PARK}" stroke="{PARKED}" stroke-width="1.2"/>')
s.append(circle(DUP[0], DUP[1], 22))
s.append(circle(WC[0], WC[1], 19))

# ============================ SUBJECT PARCEL ====================================
# Block bounded by 24th–23rd and N–M (cleared of footprints above).
s.append(f'<rect x="{PARCEL_X}" y="{PARCEL_Y}" width="{PARCEL_W}" height="{PARCEL_H}" '
         f'rx="3" fill="{GOLD}" fill-opacity="0.16" stroke="{GOLD_D}" stroke-width="1.8" stroke-opacity="0.85"/>')
# a couple of faint gold-tinted footprints inside so the parcel isn't an empty box
s.append(f'<rect x="{PARCEL_X+12}" y="{PARCEL_Y+12}" width="{PARCEL_W-24}" height="{PARCEL_H*0.42:.0f}" '
         f'rx="2.5" fill="{GOLD}" fill-opacity="0.13" stroke="{GOLD_D}" stroke-width="0.9" stroke-opacity="0.5"/>')

# ============================ LABELS w/ HALOS ===================================
def txt(x, y, t, size=13, fill=INK, weight="400", ls="0", anchor="middle",
        rot=0, halo=True, hw=3.2, family="'Georgia', serif", opacity="1"):
    tr = f' transform="rotate({rot} {x} {y})"' if rot else ""
    base = (f'font-size="{size}" font-family="{family}" font-weight="{weight}" '
            f'letter-spacing="{ls}" text-anchor="{anchor}"')
    out = ""
    if halo:
        out += (f'<text x="{x}" y="{y}" {base} stroke="{HALO}" stroke-width="{hw}" '
                f'stroke-linejoin="round" fill="{HALO}"{tr} opacity="{opacity}">{t}</text>')
    out += f'<text x="{x}" y="{y}" {base} fill="{fill}"{tr} opacity="{opacity}">{t}</text>'
    return out

# ---- Neighborhood labels (light sans, generous tracking) -----------------------
def hood(x, y, t, size=17, rot=0, anchor="middle"):
    return txt(x, y, t, size=size, fill=HOOD, weight="600", ls="4.5",
               anchor=anchor, rot=rot, hw=4.0,
               family="'Helvetica Neue', Arial, sans-serif")

s.append(hood(70, 300, "GEORGETOWN", 17, rot=-90))
s.append(hood(214, 668, "POTOMAC  RIVER", 12, rot=-33, anchor="middle"))
s.append(hood(946, 120, "DUPONT  CIRCLE", 15))
# CBD east-edge label: bump size/weight to match GEORGETOWN and pull inboard off the
# frame, sitting in the right margin clear of the (retightened) street labels.
s.append(txt(1120, 430, "CENTRAL  BUSINESS  DISTRICT", size=16, fill=HOOD, weight="700",
             ls="3.0", anchor="middle", rot=90, hw=4.0,
             family="'Helvetica Neue', Arial, sans-serif"))
s.append(hood(718, 330, "WEST  END", 20))
s.append(hood(520, 756, "FOGGY  BOTTOM  ·  GWU", 14))

# ---- Street labels (faint, tracked) --------------------------------------------
for x, l in V:
    s.append(txt(x, GY0 - 12, l, size=11.5, fill=STLBL, weight="500", ls="0.6",
                 family="'Helvetica Neue', Arial, sans-serif", hw=2.6))
for y, l in H:
    s.append(txt(GX1 + 6, y + 4, l, size=11.5, fill=STLBL, weight="500", ls="0.6",
                 anchor="start", family="'Helvetica Neue', Arial, sans-serif", hw=2.6))

# ---- Avenue labels (rotated along the line) ------------------------------------
ang_nh = math.degrees(math.atan2(DUP[1] - WC[1], DUP[0] - WC[0]))
# place NH label on the diagonal, in a clear stretch NE of the parcel
nh_t = 0.44
nhx = WC[0] + (DUP[0] - WC[0]) * nh_t
nhy = WC[1] + (DUP[1] - WC[1]) * nh_t
s.append(txt(nhx, nhy - 12, "New Hampshire Ave", size=11.5, fill=INK_SOFT, weight="500",
             ls="0.4", rot=ang_nh, family="'Georgia', serif", hw=2.8))
ang_pa = math.degrees(math.atan2(PENN_END[1] - WC[1], PENN_END[0] - WC[0]))
pa_t = 0.62
pax = WC[0] + (PENN_END[0] - WC[0]) * pa_t
pay = WC[1] + (PENN_END[1] - WC[1]) * pa_t
s.append(txt(pax, pay - 11, "Pennsylvania Ave", size=11.5, fill=INK_SOFT, weight="500",
             ls="0.4", rot=ang_pa, family="'Georgia', serif", hw=2.8))

# ============================ HOTELS (M St, one block south) =====================
hx = [452, 512, 572, 632]
hnames = ["Ritz-Carlton", "Park Hyatt", "Fairmont", "Westin"]
for x in hx:
    s.append(f'<circle cx="{x}" cy="490" r="4.4" fill="{GOLD}" stroke="#FFFFFF" stroke-width="1.4"/>')
# refined caption plate under M St, centered on the four dots
cap_cx = sum(hx) / len(hx)
plate_w = 372
s.append(f'<rect x="{cap_cx-plate_w/2:.0f}" y="512" width="{plate_w}" height="26" rx="6" '
         f'fill="#FFFFFF" fill-opacity="0.88" stroke="{ST_CASE}" stroke-width="1"/>')
s.append(f'<text x="{cap_cx-plate_w/2+14:.0f}" y="529" font-size="11.5" '
         f'font-family="\'Georgia\', serif" letter-spacing="0.3">'
         f'<tspan fill="{GOLD_D}" font-weight="700" letter-spacing="1">LUXURY HOTELS&#160;&#160;</tspan>'
         f'<tspan fill="{INK_SOFT}">Ritz-Carlton · Park Hyatt · Fairmont · Westin</tspan></text>')

# ============================ WALK ROUTES =======================================
# Legible dot-dash walk lines from the subject block to each Metro so the
# walkability story reads at slide scale (previously faint cream avenue ribbons).
WALK   = "#7C7161"    # warm dark taupe, reads clearly on the ivory basemap
def walk_route(pts):
    d = "M" + " L".join(f"{x:.0f},{y:.0f}" for x, y in pts)
    # soft light casing under the dash so it separates from the grid, then dashes
    return (f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="6.5" '
            f'stroke-opacity="0.55" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{d}" fill="none" stroke="{WALK}" stroke-width="2.6" '
            f'stroke-linecap="round" stroke-linejoin="round" '
            f'stroke-dasharray="1.5 7"/>')
# to Foggy Bottom–GWU (south): down toward the roundel
s.append(walk_route([(476, 490), (528, 560), (588, 634)]))
# to Dupont Circle (NE): step east off the block, then climb diagonally to the
# station (reads as a route, clear of the WEST END label and the grid lines).
s.append(walk_route([(536, 432), (700, 424), (860, 350), (960, 258)]))

# ============================ METRO ROUNDELS ====================================
def metro(cx, cy, bars):
    g = f'<g filter="url(#soft)"><circle cx="{cx}" cy="{cy}" r="13.5" fill="{METRO}"/></g>'
    g += (f'<text x="{cx}" y="{cy+5.5}" text-anchor="middle" font-size="17" font-weight="800" '
          f'fill="#FFFFFF" font-family="Georgia, serif">M</text>')
    n = len(bars); total = 24; bw = total / n
    for i, c in enumerate(bars):
        g += (f'<rect x="{cx-12+i*bw:.2f}" y="{cy+15}" width="{bw:.2f}" height="4.4" '
              f'rx="1" fill="{c}"/>')
    return g

# Foggy Bottom-GWU (Blue/Orange/Silver) — SOUTH of property, 9-min walk
fb = (600, 650)
s.append(metro(fb[0], fb[1], [BLUE, ORANGE, SILVER]))
s.append(txt(fb[0] + 24, fb[1] - 2, "Foggy Bottom–GWU", size=12.5, fill=INK, weight="700",
             ls="0.2", anchor="start", family="'Helvetica Neue', Arial, sans-serif", hw=3.2))
s.append(txt(fb[0] + 24, fb[1] + 15, "9-min walk", size=11.5, fill=INK_SOFT, weight="400",
             ls="0.2", anchor="start", family="'Georgia', serif", hw=3.0))

# Dupont Circle (Red) — NORTHEAST, 13-min walk. Roundel offset from circle center.
dm = (992, 234)
s.append(metro(dm[0], dm[1], [RED]))
s.append(txt(dm[0], dm[1] + 30, "Dupont Circle", size=12.5, fill=INK, weight="700",
             ls="0.2", family="'Helvetica Neue', Arial, sans-serif", hw=3.2))
s.append(txt(dm[0], dm[1] + 46, "13-min walk", size=11.5, fill=INK_SOFT, weight="400",
             ls="0.2", family="'Georgia', serif", hw=3.0))

# ============================ SUBJECT PIN =======================================
# Pin TIP lands on the parcel centroid; the address callout sits ABOVE the pin
# (institutional convention) so its bottom clears the gold parcel outline entirely
# and the pin/parcel/label stack no longer feels compressed.
CENT_X = PARCEL_X + PARCEL_W / 2          # parcel centroid X (456)
CENT_Y = PARCEL_Y + PARCEL_H / 2          # parcel centroid Y (431)
px, py = CENT_X, CENT_Y                    # tip location = centroid
s.append(f'<ellipse cx="{px}" cy="{py+3}" rx="12" ry="4" fill="#000" opacity="0.16"/>')
s.append(f'<g filter="url(#soft)"><path d="M{px},{py+5} '
         f'C{px-20},{py-24} {px-20},{py-56} {px},{py-56} '
         f'C{px+20},{py-56} {px+20},{py-24} {px},{py+5} Z" '
         f'fill="{GOLD}" stroke="#FFFFFF" stroke-width="3.2"/></g>')
s.append(f'<circle cx="{px}" cy="{py-35}" r="8.4" fill="#FFFFFF"/>'
         f'<circle cx="{px}" cy="{py-35}" r="3.8" fill="{GOLD_D}"/>')

# ---- Address callout ABOVE the pin (with downward tail) -------------------------
lbl = "2300 N Street, NW"
lw = len(lbl) * 8.4 + 28
plate_h = 30
# plate bottom sits ~14px above the pin head; tail points down toward the pin
ly = py - 56 - 20 - plate_h              # plate top, clearly above the pin body
tail_y = ly + plate_h                    # plate bottom
s.append(f'<g filter="url(#soft)"><rect x="{px-lw/2:.0f}" y="{ly:.0f}" width="{lw:.0f}" height="{plate_h}" '
         f'rx="7" fill="{INK}"/>'
         f'<path d="M{px-8},{tail_y-1} L{px+8},{tail_y-1} L{px},{tail_y+9} Z" fill="{INK}"/></g>')
s.append(f'<text x="{px}" y="{ly+20:.0f}" text-anchor="middle" font-size="15" font-weight="700" '
         f'fill="#FFFFFF" font-family="\'Georgia\', serif" letter-spacing="0.4">{lbl}</text>')

# ============================ NORTH ARROW + SCALE ================================
# North arrow top-right, clear of labels.
s.append(f'<g transform="translate(1112,92)">'
         f'<circle cx="0" cy="-4" r="22" fill="#FFFFFF" fill-opacity="0.75" stroke="{ST_CASE}" stroke-width="1"/>'
         f'<path d="M0,-22 L8,4 L0,-2 L-8,4 Z" fill="{INK}"/>'
         f'<path d="M0,-22 L8,4 L0,-2 Z" fill="{INK_SOFT}"/>'
         f'<text x="0" y="24" text-anchor="middle" font-size="12" font-weight="800" '
         f'fill="{INK}" font-family="Georgia, serif">N</text></g>')

# ---- Lower-left institutional block: legend chip + graduated scale bar ----------
# A compact white card (matches Map D's convention) with a one-line legend
# (Subject / Metro / Hotel) and a graduated 0–1/8–1/4-mile scale bar.
LEG_X, LEG_Y = 40, 726
LEG_W, LEG_H = 306, 56
s.append(f'<g filter="url(#soft)"><rect x="{LEG_X}" y="{LEG_Y}" width="{LEG_W}" height="{LEG_H}" '
         f'rx="9" fill="#FFFFFF" fill-opacity="0.94" stroke="{ST_CASE}" stroke-width="1"/></g>')

# Row 1: legend chips (Subject / Metro / Hotel)
lgy = LEG_Y + 20
# Subject: mini gold pin glyph
s.append(f'<path d="M{LEG_X+22},{lgy+4} C{LEG_X+15},{lgy-6} {LEG_X+15},{lgy-15} {LEG_X+22},{lgy-15} '
         f'C{LEG_X+29},{lgy-15} {LEG_X+29},{lgy-6} {LEG_X+22},{lgy+4} Z" fill="{GOLD}" '
         f'stroke="#FFFFFF" stroke-width="1.4"/>'
         f'<circle cx="{LEG_X+22}" cy="{lgy-9}" r="2.6" fill="#FFFFFF"/>')
s.append(txt(LEG_X+34, lgy+1, "Subject", size=11.5, fill=INK, weight="600", ls="0.2",
             anchor="start", halo=False, family="'Helvetica Neue', Arial, sans-serif"))
# Metro: mini M roundel
s.append(f'<circle cx="{LEG_X+132}" cy="{lgy-5}" r="8.5" fill="{METRO}"/>'
         f'<text x="{LEG_X+132}" y="{lgy-1}" text-anchor="middle" font-size="11" font-weight="800" '
         f'fill="#FFFFFF" font-family="Georgia, serif">M</text>')
s.append(txt(LEG_X+146, lgy+1, "Metro", size=11.5, fill=INK, weight="600", ls="0.2",
             anchor="start", halo=False, family="'Helvetica Neue', Arial, sans-serif"))
# Hotel: mini gold dot
s.append(f'<circle cx="{LEG_X+228}" cy="{lgy-5}" r="4.6" fill="{GOLD}" stroke="#FFFFFF" stroke-width="1.3"/>')
s.append(txt(LEG_X+240, lgy+1, "Hotel", size=11.5, fill=INK, weight="600", ls="0.2",
             anchor="start", halo=False, family="'Helvetica Neue', Arial, sans-serif"))

# Row 2: graduated scale bar (0 – 1/8 – 1/4 mile)
sby = LEG_Y + 42
sbx = LEG_X + 18
seg = 44                                  # px per 1/8-mile segment
s.append(f'<rect x="{sbx}" y="{sby-4}" width="{seg}" height="7" fill="{INK}" stroke="{INK}" stroke-width="0.8"/>'
         f'<rect x="{sbx+seg}" y="{sby-4}" width="{seg}" height="7" fill="#FFFFFF" stroke="{INK}" stroke-width="0.8"/>')
for i, lab in enumerate(["0", "⅛", "¼"]):
    tx = sbx + i * seg
    s.append(f'<line x1="{tx}" y1="{sby-6}" x2="{tx}" y2="{sby+4}" stroke="{INK}" stroke-width="1"/>')
    s.append(txt(tx, sby+16, lab, size=10, fill=INK_SOFT, weight="500", ls="0",
                 anchor="middle", halo=False, family="'Georgia', serif"))
s.append(txt(sbx + 2*seg + 24, sby+3, "mile", size=10.5, fill=INK_SOFT, weight="400", ls="0.5",
             anchor="start", halo=False, family="'Georgia', serif"))

# ---- Thin editorial inner frame -------------------------------------------------
s.append(f'<rect x="14" y="14" width="{VBW-28}" height="{VBH-28}" fill="none" '
         f'stroke="{GOLD_D}" stroke-width="1" stroke-opacity="0.35"/>')
s.append(f'<rect x="19" y="19" width="{VBW-38}" height="{VBH-38}" fill="none" '
         f'stroke="{INK_SOFT}" stroke-width="0.5" stroke-opacity="0.25"/>')

# ============================ ASSEMBLE ==========================================
defs = ('<defs>'
        '<filter id="soft" x="-40%" y="-40%" width="180%" height="180%">'
        '<feDropShadow dx="0" dy="1.6" stdDeviation="1.8" flood-color="#000" flood-opacity="0.22"/>'
        '</filter>'
        '</defs>')

html = (f'<!doctype html><html><head><meta charset="utf-8"><style>'
        f'*{{margin:0;padding:0}}'
        f'body{{width:{VBW}px;height:{VBH}px;overflow:hidden;background:{PAPER};}}'
        f'</style></head><body>'
        f'<svg width="{VBW}" height="{VBH}" viewBox="0 0 {VBW} {VBH}" '
        f'xmlns="http://www.w3.org/2000/svg">{defs}{"".join(s)}</svg>'
        f'</body></html>')

hp = os.path.join(tempfile.gettempdir(), "map_B_final.html")
open(hp, "w").write(html)
tmp = os.path.join(tempfile.gettempdir(), "map_B_final_raw.png")
os.makedirs(OUT_DIR, exist_ok=True)
out = os.path.join(OUT_DIR, "location_map.png")

subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
                "--force-device-scale-factor=2", f"--window-size={VBW},940",
                f"--screenshot={tmp}", f"file://{hp}"],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

from PIL import Image
img = Image.open(tmp).convert("RGB")
img = img.crop((0, 0, 2330, 1600))
img.save(out)
print("wrote", out, img.size, os.path.getsize(out), "bytes")
