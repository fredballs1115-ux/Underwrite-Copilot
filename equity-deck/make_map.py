#!/usr/bin/env python3
"""Premium soft-isometric (2.5D extruded) city map for 2300 N Street, NW — West End, Washington DC.
North is up. Numbered streets increase going WEST; lettered streets advance going NORTH.
Buildings are extruded blocks (top face + two shaded side faces + soft ground shadow).
The SUBJECT building is the gold-lit hero. Screenshots headless Chromium, crops to 2330x1600."""
import os, subprocess, tempfile, math, random

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
VBW, VBH = 1165, 800

# =============================================================================
#  PALETTE  — warm, sophisticated, magazine-quality dusk
# =============================================================================
SKY_TOP   = "#F3EEE6"   # warm ivory sky at top
SKY_BOT   = "#E7DFD2"   # ground haze
GROUND    = "#E4DCCC"   # base ground plane (warm sand)
GROUND2   = "#DED5C2"
STREET    = "#EFE9DD"   # street channel surface (light, warm)
STREET_ED = "#D8CFBB"
AVE_FILL  = "#F1E4C6"   # warm sunlit avenue
AVE_ED    = "#E1CFA6"

# building face tones — one harmonious WARM family: creams, sand, warm taupe, soft
# terracotta. NO cool greys — everything sits in the warm dusk palette so the gold hero pops.
TOP_TONES = ["#EFE7D7", "#EAE0CC", "#E5DAC2", "#E0D3BB", "#E7DCC6",
             "#E8DABE", "#E1D0B4",              # warm sand
             "#DECDB4", "#E4D3BB",              # warm taupe
             "#E0C9AC", "#DAC1A2",              # soft terracotta accent
             "#DCCDB2", "#D6C6AC"]              # deeper warm taupe (was cool slate)
LEFT_MUL  = 0.86        # left/west face shade multiplier (lit side)
RIGHT_MUL = 0.66        # right/south face shade (darker, in shadow — deeper for 3D depth)

PARK      = "#C2D3A6"   # sage green (a touch deeper for contrast)
PARK_ED   = "#AFC191"
PARK_DK   = "#B7C99B"
WATER     = "#B4CDDB"   # dusty blue potomac (slightly deeper)
WATER_ED  = "#9EBBCB"

GOLD      = "#E7B44C"   # hero gold
GOLD_HI   = "#FBDE95"   # gold highlight top face (brighter)
GOLD_MID  = "#DB9C2E"   # gold side (lit) — start of gradient
GOLD_MID2 = "#C6851F"   # gold side (lit) — deeper amber end of gradient
GOLD_DK   = "#A96C16"   # gold deep side (shadow face)
GOLD_LINE = "#9A6E22"
GOLD_EDGE = "#FFE9BE"   # crisp warm corner-highlight line

INK       = "#332F28"
INK_SOFT  = "#6E6656"
HOOD      = "#9A9080"   # neighborhood label warm grey
HOOD_DK   = "#847A69"
STLBL     = "#B3AA98"
HALO      = "#F1ECE3"
METRO     = "#26221E"
RED="#D01F4E"; BLUE="#0A78D0"; ORANGE="#F79420"; SILVER="#A8AAA6"

def shade(hexc, mul):
    h = hexc.lstrip("#")
    r,g,b = int(h[0:2],16),int(h[2:4],16),int(h[4:6],16)
    r=max(0,min(255,int(r*mul))); g=max(0,min(255,int(g*mul))); b=max(0,min(255,int(b*mul)))
    return f"#{r:02x}{g:02x}{b:02x}"

# =============================================================================
#  ISOMETRIC PROJECTION
#  World coords: x -> east(right), y -> south(down/toward viewer), z -> up(height)
#  We use a gentle axonometric tilt: screen = origin + x*ex + y*ey - z*ez
# =============================================================================
random.seed(11)

# Projection basis — true 2:1 dimetric isometric (SimCity look), premium + readable.
# East (+x) goes right-and-down; South (+y) goes left-and-down. North ends up "up".
ISO = 0.50              # 2:1 vertical squash
EX = ( 1.00,  ISO)      # per world-x  (right, down)
EY = (-1.00,  ISO)      # per world-y  (left,  down)
EZ = 1.15               # per world-z (height -> up on screen)
SCALE = 0.68            # global world->screen scale

ORIGIN = (516.0, 168.0)  # tuned so the diamond fills the frame, hero near center

def proj(wx, wy, wz=0.0):
    sx = ORIGIN[0] + (wx*EX[0] + wy*EY[0])*SCALE
    sy = ORIGIN[1] + (wx*EX[1] + wy*EY[1])*SCALE - wz*EZ*SCALE
    return (sx, sy)

# =============================================================================
#  GRID (world coordinates)  — plan grid, then projected.
#  Numbered streets N-S, increase WEST => higher number = smaller world-x (left).
#  Lettered streets E-W, advance NORTH => north(top) = smaller world-y.
# =============================================================================
# vertical (numbered) street world-x positions, left(west/high#) -> right(east/low#)
V = [( 40,"25th"),(200,"24th"),(360,"23rd"),(520,"22nd"),(680,"21st"),(840,"20th")]
# horizontal (lettered) street world-y positions, top(north) -> bottom(south)
H = [( 30,"P St"),(150,"O St"),(270,"N St"),(390,"M St"),(510,"L St"),(630,"K St")]

VX = [v[0] for v in V]; VLBL=[v[1] for v in V]
HY = [h[0] for h in H]; HLBL=[h[1] for h in H]

WX0, WX1 = VX[0], VX[-1]
WY0, WY1 = HY[0], HY[-1]

ROAD = 26   # street channel half-width-ish (gap between block edges)

s = []

# =============================================================================
#  BACKDROP  — vertical sky gradient + soft vignette
# =============================================================================
s.append('<rect width="{}" height="{}" fill="url(#sky)"/>'.format(VBW,VBH))

# =============================================================================
#  GROUND PLANE  — a large projected quad tinted warm, giving the whole scene a base.
# =============================================================================
gm = 600  # ground margin in world units around grid (large so no edge shows)
g_corners = [proj(WX0-gm, WY0-gm), proj(WX1+gm, WY0-gm),
             proj(WX1+gm, WY1+gm), proj(WX0-gm, WY1+gm)]
gp = " ".join(f"{x:.1f},{y:.1f}" for x,y in g_corners)
s.append(f'<polygon points="{gp}" fill="url(#ground)"/>')

# =============================================================================
#  ROCK CREEK PARK (west/left edge) + POTOMAC (southwest) as projected shapes
# =============================================================================
# Park: a band running along the far-west world edge (small world-x), full height.
def poly(pts, fill, stroke=None, sw=1.0, op=1.0):
    p = " ".join(f"{x:.1f},{y:.1f}" for x,y in pts)
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<polygon points="{p}" fill="{fill}"{st} fill-opacity="{op}"/>'

# The scene is a diamond: NW(523,192) top, SW(115,396) left, SE(659,668) bottom.
# The WEST edge is the NW->SW diagonal (upper-left). Everything left of it is off-grid
# ground we dress with a green park mass (upper/mid-left) and blue water (lower-left).
# We author these directly in SCREEN space for precise, reliable placement.

# --- ROCK CREEK PARK: an organic green mass filling the WEST / left edge ---
# hugs the NW->SW grid edge on its right side, spills off the left frame edge.
park_pts = [
    (-30, -30), (250, -30),                  # top edge runs off the top frame (no hard line)
    (360, 90), (390, 200),                   # gentle bulge, tucked left of the NW grid corner
    (300, 285), (215, 375), (150, 435),      # inner boundary hugging the west grid edge
    (95, 470), (35, 515), (-30, 540),        # down toward lower-left, meeting the water
    (-30, -30),
]
park_svg = poly(park_pts, PARK, PARK_ED, 2.0)
s.append(park_svg)
# darker tree-canopy lobes for depth — soft-blurred, kept well inside the green mass
s.append(f'<g filter="url(#blur)">'
         f'<ellipse cx="120" cy="215" rx="130" ry="88" fill="{PARK_DK}" opacity="0.42"/>'
         f'<ellipse cx="60" cy="360" rx="105" ry="78" fill="{PARK_DK}" opacity="0.38"/></g>')

# --- POTOMAC RIVER: a soft-blue water mass across the SW / lower-left corner ---
# sits below the park, filling the lower-left, sweeping off the bottom + left frame.
water_pts = [
    (-30, 545), (30, 520), (120, 490),        # top of water meets base of park
    (240, 520), (340, 585), (420, 660),       # a broad diagonal bank sweeping SE
    (470, 740), (500, 830),                    # off the bottom edge
    (-30, 830),                                # bottom-left frame
    (-30, 545),
]
s.append(poly(water_pts, WATER, WATER_ED, 2.0))
# subtle current highlight lines on the water
s.append(f'<path d="M20,600 Q160,590 300,650" stroke="#C9DEE9" stroke-width="3" '
         f'fill="none" opacity="0.55" stroke-linecap="round"/>')
s.append(f'<path d="M10,690 Q150,685 280,740" stroke="#C9DEE9" stroke-width="2.5" '
         f'fill="none" opacity="0.45" stroke-linecap="round"/>')

# =============================================================================
#  STREET CHANNELS  — draw as projected quads (surfaces) so streets read as
#  channels between the extruded massing. Draw BEFORE buildings.
# =============================================================================
def street_quad(x0,y0,x1,y1, fill, ed):
    # a thick line in world space => a quad; approximate by offsetting perpendicular
    a=proj(x0,y0); b=proj(x1,y1)
    return a,b

# Base street plane: fill each avenue corridor. Simpler: draw wide projected lines.
def wline_h(wy, wx0, wx1, w, fill, ed=None):
    a=proj(wx0,wy); b=proj(wx1,wy)
    out=""
    if ed:
        out+=f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{ed}" stroke-width="{w+4}" stroke-linecap="round"/>'
    out+=f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{fill}" stroke-width="{w}" stroke-linecap="round"/>'
    return out
def wline_v(wx, wy0, wy1, w, fill, ed=None):
    a=proj(wx,wy0); b=proj(wx,wy1)
    out=""
    if ed:
        out+=f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{ed}" stroke-width="{w+4}" stroke-linecap="round"/>'
    out+=f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{fill}" stroke-width="{w}" stroke-linecap="round"/>'
    return out

# lay street grid surfaces
for wy in HY:
    s.append(wline_h(wy, WX0-40, WX1+40, 20 if wy!=270 else 24, STREET, STREET_ED))
for wx in VX:
    s.append(wline_v(wx, WY0-40, WY1+40, 20 if wx!=360 else 24, STREET, STREET_ED))

# =============================================================================
#  DIAGONAL AVENUES + CIRCLES (world coords), drawn as warm sunlit corridors
# =============================================================================
def wline_seg(p0, p1, w, fill, ed=None):
    a=proj(*p0); b=proj(*p1)
    out=""
    if ed:
        out+=f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{ed}" stroke-width="{w+4}" stroke-linecap="round"/>'
    out+=f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{fill}" stroke-width="{w}" stroke-linecap="round"/>'
    return out

WC = (360, 630)     # Washington Circle (23rd & K) — SW
DUP = (462, -250)   # Dupont Circle — NE (projects to upper-right, under its label)
PENN_END = (900, 700)  # Pennsylvania Ave to SE
# New Hampshire Ave SW->NE
s.append(wline_seg(WC, DUP, 22, AVE_FILL, AVE_ED))
# Pennsylvania Ave SE
s.append(wline_seg(WC, PENN_END, 22, AVE_FILL, AVE_ED))

# traffic circles (projected ellipses)
def wcircle(cw, r, fill, ed):
    c=proj(*cw)
    return (f'<ellipse cx="{c[0]:.1f}" cy="{c[1]:.1f}" rx="{r:.1f}" ry="{r*0.62:.1f}" '
            f'fill="{fill}" stroke="{ed}" stroke-width="2"/>')
s.append(wcircle(WC, 26, PARK, PARK_ED))
s.append(wcircle(DUP, 30, PARK, PARK_ED))

# =============================================================================
#  EXTRUDED BUILDING BLOCKS
#  Each parcel: a footprint rect (world x0,y0,x1,y1) extruded to height h.
#  We draw ground shadow, then right(south) face, left(west) face, then top face.
#  Painter's order: sort parcels back-to-front (north/back first).
# =============================================================================
def building(x0, y0, x1, y1, h, toptone, hero=False):
    """Return (depth_key, svg) for one extruded block."""
    # world corners of footprint (top face at z=h)
    # top face corners
    tA = proj(x0, y0, h); tB = proj(x1, y0, h)
    tC = proj(x1, y1, h); tD = proj(x0, y1, h)
    # base corners (z=0)
    bA = proj(x0, y0, 0); bB = proj(x1, y0, 0)
    bC = proj(x1, y1, 0); bD = proj(x0, y1, 0)

    if hero:
        top_f, left_f, right_f = GOLD_HI, "url(#goldface)", GOLD_DK
        edge = GOLD_LINE; ew = 1.1
    else:
        top_f = toptone
        left_f = shade(toptone, LEFT_MUL)
        right_f = shade(toptone, RIGHT_MUL)
        edge = shade(toptone, 0.60); ew = 0.5

    out = []
    # ground shadow (offset toward lower-right = away from light)
    sh = [proj(x0, y1, 0), proj(x1, y1, 0),
          proj(x1+18, y1+18, 0), proj(x0+18, y1+18, 0)]
    shp = " ".join(f"{x:.1f},{y:.1f}" for x,y in sh)
    # (shadows drawn separately in a pass to stay under all blocks)

    # RIGHT (south, +y) face: corners bD-bC-tC-tD
    rp = f"{bD[0]:.1f},{bD[1]:.1f} {bC[0]:.1f},{bC[1]:.1f} {tC[0]:.1f},{tC[1]:.1f} {tD[0]:.1f},{tD[1]:.1f}"
    out.append(f'<polygon points="{rp}" fill="{right_f}" stroke="{edge}" stroke-width="{ew}" stroke-linejoin="round"/>')
    # LEFT (east, +x) face: corners bB-bC-tC-tB  -> this is the east face (right side of screen)
    lp = f"{bB[0]:.1f},{bB[1]:.1f} {bC[0]:.1f},{bC[1]:.1f} {tC[0]:.1f},{tC[1]:.1f} {tB[0]:.1f},{tB[1]:.1f}"
    out.append(f'<polygon points="{lp}" fill="{left_f}" stroke="{edge}" stroke-width="{ew}" stroke-linejoin="round"/>')
    # TOP face
    tp = f"{tA[0]:.1f},{tA[1]:.1f} {tB[0]:.1f},{tB[1]:.1f} {tC[0]:.1f},{tC[1]:.1f} {tD[0]:.1f},{tD[1]:.1f}"
    out.append(f'<polygon points="{tp}" fill="{top_f}" stroke="{edge}" stroke-width="{ew}" stroke-linejoin="round"/>')
    # depth key: larger (x+y) = closer to viewer -> draw later
    depth = (x0 + y0)
    return depth, "".join(out), shp

# Build parcels tiling each block between streets, leaving street gutters.
GUT = 30  # gutter from street centerline to block edge
parcels = []  # (x0,y0,x1,y1,h,toptone,hero)

# subject building: 23rd & N. Substantial WIDE hero footprint, tallest tower.
# ONE clean confident extrusion — a broad footprint, moderate height so proportions
# read as a stately tower (not a needle wearing a hat). No setback crown.
SUBJ_X0, SUBJ_Y0 = 292, 200
SUBJ_X1, SUBJ_Y1 = 400, 292
SUBJ_H = 205

# Hotel POI positions live in a cleared strip on M St so no extrusion overlaps them.
# The strip is widened on BOTH sides of the row and buildings near it are trimmed,
# so the dots read as sitting on open pavement, never stuck to a wall.
HOTEL_Y = 390                      # world-y of the hotel row (on the M St line)
HOTEL_XS = [250, 322, 394, 466]    # world-x of the four hotels
HOTEL_X_LO, HOTEL_X_HI = 224, 492
HOTEL_CLEAR_Y0, HOTEL_CLEAR_Y1 = HOTEL_Y-40, HOTEL_Y+40    # generous keep-clear band

def blocks_between(wx_a, wx_b, wy_a, wy_b):
    """Tile the block area with 1-3 parcels; return list of parcel tuples."""
    x0 = wx_a + GUT; x1 = wx_b - GUT
    y0 = wy_a + GUT; y1 = wy_b - GUT
    if x1-x0 < 20 or y1-y0 < 20: return []
    res=[]
    ncol = max(1, round((x1-x0)/60))
    nrow = max(1, round((y1-y0)/58))
    cw=(x1-x0)/ncol; ch=(y1-y0)/nrow
    for r in range(nrow):
        for c in range(ncol):
            if random.random()<0.08: continue
            px0 = x0 + c*cw + random.uniform(1,4)
            py0 = y0 + r*ch + random.uniform(1,4)
            px1 = x0 + (c+1)*cw - random.uniform(1,4)
            py1 = y0 + (r+1)*ch - random.uniform(1,4)
            if px1-px0<12 or py1-py0<12: continue
            # keep the hotel strip clear of any building that would occlude a dot
            if not (px1 < HOTEL_X_LO or px0 > HOTEL_X_HI) and py1 > HOTEL_CLEAR_Y0 and py0 < HOTEL_CLEAR_Y1:
                continue
            h = random.uniform(58, 132)
            tone = random.choice(TOP_TONES)
            res.append((px0,py0,px1,py1,h,tone,False))
    return res

# Reserve clean "label lanes" of open pavement at the south + east edges so the
# rotated street pills sit on ground, never grazing an extrusion.
PILL_LANE_S = WY1 + 55   # numbered pills ride this southern lane
PILL_LANE_E = WX1 + 60   # lettered pills ride this eastern lane

# iterate grid cells (including margins so frame reads developed)
margin_v = [WX0-200] + VX + [WX1+200]
margin_h = [WY0-160] + HY + [WY1+160]
for xi in range(len(margin_v)-1):
    for yi in range(len(margin_h)-1):
        wx_a, wx_b = margin_v[xi], margin_v[xi+1]
        wy_a, wy_b = margin_h[yi], margin_h[yi+1]
        cx=(wx_a+wx_b)/2; cy=(wy_a+wy_b)/2
        # skip park (far west)
        if cx < WX0-40: continue
        # skip potomac (SW)
        if cx < WX0+120 and cy > WY1+40: continue
        # keep the SOUTHERN margin band low-rise & sparse so it can't overlap pills
        if cy > WY1 + 25:
            for p in blocks_between(wx_a,wx_b,wy_a,wy_b):
                px0,py0,px1,py1,h,tone,hero=p
                if py1 > WY1 + 30:   # trim any parcel that would reach the pill lane
                    continue
                parcels.append((px0,py0,px1,py1,min(h,70),tone,hero))
            continue
        # keep the EASTERN margin band low-rise & clear of the lettered pill lane
        if cx > WX1 + 25:
            for p in blocks_between(wx_a,wx_b,wy_a,wy_b):
                px0,py0,px1,py1,h,tone,hero=p
                if px1 > WX1 + 30:
                    continue
                parcels.append((px0,py0,px1,py1,min(h,72),tone,hero))
            continue
        # skip the subject cell (handled specially)
        if wx_a < (SUBJ_X0+SUBJ_X1)/2 < wx_b and wy_a < (SUBJ_Y0+SUBJ_Y1)/2 < wy_b:
            # fill rest of this block with a couple normal parcels but leave hero clear
            for p in blocks_between(wx_a,wx_b,wy_a,wy_b):
                # drop parcels overlapping the hero footprint
                if not (p[2] < SUBJ_X0-6 or p[0] > SUBJ_X1+6 or p[3] < SUBJ_Y0-6 or p[1] > SUBJ_Y1+6):
                    continue
                parcels.append(p)
            continue
        parcels.extend(blocks_between(wx_a,wx_b,wy_a,wy_b))

# add hero
parcels.append((SUBJ_X0,SUBJ_Y0,SUBJ_X1,SUBJ_Y1,SUBJ_H,GOLD_HI,True))

# ---- SHADOW PASS (all soft ground shadows first, under everything) ----
shadow_svg=[]
for (x0,y0,x1,y1,h,tone,hero) in parcels:
    off = 6 + h*0.10
    sh = [proj(x0, y0, 0), proj(x1, y0, 0), proj(x1, y1, 0), proj(x0, y1, 0)]
    # offset shadow toward lower-right
    sh2 = [(x+off, y+off*0.7) for (x,y) in sh]
    shp = " ".join(f"{x:.1f},{y:.1f}" for x,y in sh2)
    shadow_svg.append(f'<polygon points="{shp}" fill="#000" opacity="0.09"/>')
s.append(f'<g filter="url(#blur)">{"".join(shadow_svg)}</g>')

# ---- BUILDING PASS (painter's order back-to-front) ----
built=[]
for p in parcels:
    d, svg, shp = building(*p)
    built.append((d, svg, p[6]))
built.sort(key=lambda t:t[0])
for d,svg,hero in built:
    s.append(svg)

# hero glow pool of light at base — wider + softer so the eye locks onto the tower.
# Two stacked pools: a broad warm wash + a tighter bright core.
hc = proj((SUBJ_X0+SUBJ_X1)/2, (SUBJ_Y0+SUBJ_Y1)/2, 0)
s.append(f'<ellipse cx="{hc[0]:.1f}" cy="{hc[1]+14:.1f}" rx="184" ry="104" fill="url(#goldpool)" opacity="0.5"/>')
s.append(f'<ellipse cx="{hc[0]:.1f}" cy="{hc[1]+8:.1f}" rx="146" ry="82" fill="url(#goldpool)" opacity="0.55"/>')
s.append(f'<ellipse cx="{hc[0]:.1f}" cy="{hc[1]:.1f}" rx="94" ry="55" fill="url(#goldglow)" opacity="0.68"/>')

# crisp corner highlight on the MAIN tower's front vertical edge (between lit + shadow faces)
def hero_corner(x1, y1, zbase, ztop, w=2.6, col=GOLD_EDGE, op=0.95):
    a = proj(x1, y1, zbase); b = proj(x1, y1, ztop)
    return (f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" '
            f'stroke="{col}" stroke-width="{w}" stroke-linecap="round" opacity="{op}"/>')

# The hero is ONE clean extruded tower (drawn in the building pass). No setback crown.
# A single crisp corner highlight runs up the front vertical edge, from just above the
# foreground rooftops to the roofline, so the tower reads as one confident volume.
s.append(hero_corner(SUBJ_X1, SUBJ_Y1, 40, SUBJ_H, w=3.4, op=0.85))
# a soft grounding shadow anchor is already provided by the shadow pass + gold pool.

# --- balance the frame: faint warm atmospheric haze in the sparse upper-right
# (Dupont) quadrant so the composition doesn't feel heavier on the left. ---
s.append(f'<ellipse cx="1560" cy="330" rx="640" ry="440" fill="url(#haze)" opacity="0.9"/>')

# --- subtle atmospheric vignette: lift the hero center, gently deepen far corners ---
s.append(f'<rect width="{VBW}" height="{VBH}" fill="url(#vign)" opacity="0.9"/>')
# a soft warm glow halo behind the hero to make it sing
s.append(f'<ellipse cx="{px if False else hc[0]:.1f}" cy="300" rx="300" ry="220" '
         f'fill="url(#herohalo)" opacity="0.45"/>')

# =============================================================================
#  LABELS
# =============================================================================
def txt(x, y, t, size=13, fill=INK, weight="400", ls="0", anchor="middle",
        rot=0, halo=True, hw=3.4, family="'Georgia', serif", opacity="1"):
    tr = f' transform="rotate({rot} {x} {y})"' if rot else ""
    base = (f'font-size="{size}" font-family="{family}" font-weight="{weight}" '
            f'letter-spacing="{ls}" text-anchor="{anchor}"')
    out = ""
    if halo:
        out += (f'<text x="{x}" y="{y}" {base} stroke="{HALO}" stroke-width="{hw}" '
                f'stroke-linejoin="round" fill="{HALO}"{tr} opacity="{opacity}">{t}</text>')
    out += f'<text x="{x}" y="{y}" {base} fill="{fill}"{tr} opacity="{opacity}">{t}</text>'
    return out

def hood(sx, sy, t, size=17, ls="5", rot=0, fill=HOOD_DK):
    return txt(sx, sy, t, size=size, fill=fill, weight="700", ls=ls,
               rot=rot, hw=4.2, family="'Helvetica Neue', Arial, sans-serif")

# neighborhoods — project real-world anchor points so geography is correct.
def hood_w(wx, wy, t, size=17, ls="5", fill=HOOD_DK):
    p = proj(wx, wy)
    return hood(p[0], p[1], t, size, ls, fill=fill)
s.append(hood(415, 330, "GEORGETOWN", 17, ls="4"))             # west, on open ground E of the park
# ROCK CREEK PARK — sits ON the green mass (west/left), angled down the band.
s.append(txt(165, 235, "ROCK CREEK PARK", size=13, fill="#3F5330",
             weight="700", ls="1.6", hw=3.6, rot=-26,
             family="'Helvetica Neue', Arial, sans-serif"))
# POTOMAC RIVER — sits ON the blue water in the lower-left.
s.append(txt(175, 690, "POTOMAC RIVER", size=13, fill="#2C5A76",
             weight="700", ls="1.8", hw=3.6, rot=-16,
             family="'Helvetica Neue', Arial, sans-serif"))
s.append(hood(1000, 110, "DUPONT  CIRCLE", 16, ls="3"))        # NE / upper-right (fixed, clear)
s.append(hood(1015, 560, "DOWNTOWN · CBD", 14, ls="2"))        # east/right (fixed, clear)
s.append(hood(775, 235, "WEST  END", 19, ls="6"))              # open sky, right of the hero callout
s.append(hood(430, 690, "FOGGY  BOTTOM · GWU", 15, ls="3"))    # south, clear of cards

# street labels — small rotated tags in the open pavement at the grid's perimeter,
# clear of buildings. Numbered at their SOUTH-WEST end (down-left, along river side);
# lettered at their EAST end (down-right edge). Skip any that fall in busy zones.
ang_num = math.degrees(math.atan2(EY[1], EY[0]))   # numbered streets run down-left
ang_let = math.degrees(math.atan2(EX[1], EX[0]))   # lettered streets run down-right
STL = "#B0A794"
def st_tag(sx, sy, l, ang):
    # street-name pill: soft white ground plate + subtle halo so the label sits
    # cleanly on the pavement, never on an extrusion. A hair more leading (taller pill).
    w = len(l)*7.0 + 18
    return (f'<g transform="translate({sx:.1f},{sy:.1f}) rotate({ang:.1f})" filter="url(#pillshadow)">'
            f'<rect x="{-w/2:.1f}" y="-11" width="{w:.1f}" height="22" rx="11" '
            f'fill="#FFFFFF" fill-opacity="0.88" stroke="#EFE7D6" stroke-width="1"/>'
            f'<text x="0" y="4.5" text-anchor="middle" font-size="11" font-weight="700" '
            f'letter-spacing="0.5" fill="{INK_SOFT}" '
            f'font-family="\'Helvetica Neue\', Arial, sans-serif">{l}</text></g>')
# numbered: ride the reserved southern lane, on open pavement clear of all buildings
for (wx,l) in V:
    p = proj(wx, PILL_LANE_S)
    s.append(st_tag(p[0], p[1], l, ang_num))
# lettered: ride the reserved eastern lane (skip N St — clashes w/ CBD label)
for (wy,l) in H:
    if l == "N St":
        continue
    p = proj(PILL_LANE_E, wy)
    s.append(st_tag(p[0], p[1], l, ang_let))

# avenue labels along the diagonals — high contrast: a soft warm pill under the text
# so the italic serif name reads cleanly over the sunlit avenue and adjacent fabric.
def ave_label(p0, p1, t, tpar=0.5, dy=-14):
    a=proj(*p0); b=proj(*p1)
    ang=math.degrees(math.atan2(b[1]-a[1], b[0]-a[0]))
    mx=a[0]+(b[0]-a[0])*tpar; my=a[1]+(b[1]-a[1])*tpar+dy
    w = len(t)*7.4 + 20
    return (f'<g transform="translate({mx:.1f},{my:.1f}) rotate({ang:.1f})" filter="url(#pillshadow)">'
            f'<rect x="{-w/2:.1f}" y="-12" width="{w:.1f}" height="24" rx="12" '
            f'fill="#FBF4E6" fill-opacity="0.94" stroke="#E7D3A6" stroke-width="1"/>'
            f'<text x="0" y="5" text-anchor="middle" font-size="13" font-weight="700" '
            f'letter-spacing="0.3" fill="#7A5A18" '
            f'font-family="\'Georgia\', serif" font-style="italic">{t}</text></g>')
s.append(ave_label(WC, DUP, "New Hampshire Ave", 0.44, -12))
s.append(ave_label(WC, PENN_END, "Pennsylvania Ave", 0.55, -11))

# =============================================================================
#  METRO ROUNDELS (WMATA-style) + walk chip
# =============================================================================
# A premium floating "station card": roundel on the left, name + colored line bar
# + walk-time chip on the right, all on one soft white rounded card. Always legible.
# One clean UI system: both station cards share identical width, corner radius,
# internal padding, chip alignment, and drop shadow. x0 = left edge of the card.
CARD_W = 188
CARD_H = 48
CARD_R = 14
PAD    = 16          # internal padding
def metro_card(x0, cy, bars, name, walk):
    y0 = cy - CARD_H/2
    g = (f'<g filter="url(#cardshadow)">'
         f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{CARD_W}" height="{CARD_H}" rx="{CARD_R}" '
         f'fill="#FFFFFF" stroke="#EFE7D9" stroke-width="1"/></g>')
    # roundel — vertically centered, left-padded
    rcx = x0 + PAD + 15; rcy = cy
    g += f'<circle cx="{rcx:.1f}" cy="{rcy:.1f}" r="15" fill="{METRO}"/>'
    g += (f'<text x="{rcx:.1f}" y="{rcy+6.5:.1f}" text-anchor="middle" font-size="19" font-weight="800" '
          f'fill="#FFFFFF" font-family="Georgia, serif">M</text>')
    tx = rcx + 15 + 12          # text column start, consistent gap from roundel
    # name (upper row)
    g += (f'<text x="{tx:.1f}" y="{cy-5:.1f}" font-size="12.5" font-weight="700" fill="{INK}" '
          f'letter-spacing="0.15" font-family="\'Helvetica Neue\', Arial, sans-serif">{name}</text>')
    # line color chips (lower row) — consistent size/rounding, left-aligned under name
    n=len(bars); bw=7; gap=2.5; by=cy+4
    for i,c in enumerate(bars):
        g += (f'<rect x="{tx+i*(bw+gap):.1f}" y="{by:.1f}" width="{bw}" height="7" rx="2" '
              f'fill="{c}" stroke="#FFFFFF" stroke-width="0.6"/>')
    # walk chip — right-anchored to a consistent inset from the card's right edge
    ww = len(walk)*5.9 + 16
    chx = x0 + CARD_W - PAD - ww
    g += (f'<rect x="{chx:.1f}" y="{cy+2:.1f}" width="{ww:.1f}" height="17" rx="8.5" fill="{GOLD}"/>')
    g += (f'<text x="{chx+ww/2:.1f}" y="{cy+14:.1f}" text-anchor="middle" font-size="10" font-weight="700" '
          f'fill="#4A3410" letter-spacing="0.2" font-family="\'Helvetica Neue\', Arial, sans-serif">{walk}</text>')
    return g

# Foggy Bottom-GWU (south) — placed in open pavement south of the grid.
# center the fixed-width card on the station anchor.
fb = proj(360, 640)
s.append(metro_card(fb[0]-CARD_W/2, fb[1], [BLUE,ORANGE,SILVER], "Foggy Bottom–GWU", "9 min walk"))
# Dupont Circle (NE) — upper-right, right edge tucked inboard of the frame.
s.append(metro_card(1108-CARD_W, 210, [RED], "Dupont Circle", "13 min walk"))

# =============================================================================
#  HOTELS one block south on M St — small gold dots + docked caption
# =============================================================================
# Hotels on M St, sitting in the cleared strip so none collide with an extrusion.
hotel_world = [(x, HOTEL_Y) for x in HOTEL_XS]
def hotel_dot(sx, sy):
    return (f'<g filter="url(#dotshadow)">'
            f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="6.6" fill="#FFFFFF"/></g>'
            f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="5.0" fill="{GOLD}"/>'
            f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="5.0" fill="none" stroke="#B8791F" stroke-width="0.7" stroke-opacity="0.5"/>')
for hw_ in hotel_world:
    hp_=proj(*hw_)
    s.append(hotel_dot(hp_[0], hp_[1]))

# =============================================================================
#  SUBJECT HERO — elegant gold pin above the extruded gold tower + callout
# =============================================================================
# top of hero tower in screen space (single clean roofline, no crown)
htx = proj((SUBJ_X0+SUBJ_X1)/2, (SUBJ_Y0+SUBJ_Y1)/2, SUBJ_H)
px, py = htx[0], htx[1]

# refined gold pin floating above the tower
pin_y = py - 30
s.append(f'<ellipse cx="{px:.1f}" cy="{py-2:.1f}" rx="10" ry="4" fill="#000" opacity="0.14"/>')
s.append(f'<g filter="url(#soft)"><path d="M{px:.1f},{py-6:.1f} '
         f'C{px-18:.1f},{pin_y-4:.1f} {px-18:.1f},{pin_y-34:.1f} {px:.1f},{pin_y-34:.1f} '
         f'C{px+18:.1f},{pin_y-34:.1f} {px+18:.1f},{pin_y-4:.1f} {px:.1f},{py-6:.1f} Z" '
         f'fill="{GOLD}" stroke="#FFFFFF" stroke-width="3"/></g>')
s.append(f'<circle cx="{px:.1f}" cy="{pin_y-19:.1f}" r="7.6" fill="#FFFFFF"/>'
         f'<circle cx="{px:.1f}" cy="{pin_y-19:.1f}" r="3.4" fill="{GOLD_DK}"/>')

# callout plate ABOVE the pin
lbl = "2300 N Street, NW"
sub = "West End · Washington, DC"
lw = max(len(lbl), len(sub))*8.6 + 34
plate_h = 44
ly = pin_y - 34 - 16 - plate_h
tail_y = ly + plate_h
s.append(f'<g filter="url(#soft)"><rect x="{px-lw/2:.1f}" y="{ly:.1f}" width="{lw:.1f}" height="{plate_h}" '
         f'rx="9" fill="{INK}"/>'
         f'<path d="M{px-8:.1f},{tail_y-1:.1f} L{px+8:.1f},{tail_y-1:.1f} L{px:.1f},{tail_y+9:.1f} Z" fill="{INK}"/></g>')
s.append(f'<text x="{px:.1f}" y="{ly+20:.1f}" text-anchor="middle" font-size="16" font-weight="700" '
         f'fill="#FFFFFF" font-family="\'Georgia\', serif" letter-spacing="0.4">{lbl}</text>')
s.append(f'<text x="{px:.1f}" y="{ly+36:.1f}" text-anchor="middle" font-size="10.5" font-weight="600" '
         f'fill="{GOLD_HI}" font-family="\'Helvetica Neue\', Arial, sans-serif" letter-spacing="1.4">{sub.upper()}</text>')

# =============================================================================
#  NORTH ARROW + SCALE + LEGEND
# =============================================================================
s.append(f'<g transform="translate(1108,86)">'
         f'<circle cx="0" cy="0" r="22" fill="#FFFFFF" fill-opacity="0.82" stroke="{STREET_ED}" stroke-width="1"/>'
         f'<path d="M0,-16 L7,8 L0,2 L-7,8 Z" fill="{INK}"/>'
         f'<path d="M0,-16 L7,8 L0,2 Z" fill="{INK_SOFT}"/>'
         f'<text x="0" y="-22" text-anchor="middle" font-size="12" font-weight="800" '
         f'fill="{INK}" font-family="Georgia, serif">N</text></g>')

# legend card lower-left
LEG_X,LEG_Y,LEG_W,LEG_H = 40, 720, 300, 62
s.append(f'<g filter="url(#soft)"><rect x="{LEG_X}" y="{LEG_Y}" width="{LEG_W}" height="{LEG_H}" '
         f'rx="11" fill="#FFFFFF" fill-opacity="0.95" stroke="{STREET_ED}" stroke-width="1"/></g>')
lgy=LEG_Y+22
# subject pin glyph
s.append(f'<path d="M{LEG_X+22},{lgy+3} C{LEG_X+15},{lgy-6} {LEG_X+15},{lgy-15} {LEG_X+22},{lgy-15} '
         f'C{LEG_X+29},{lgy-15} {LEG_X+29},{lgy-6} {LEG_X+22},{lgy+3} Z" fill="{GOLD}" stroke="#FFFFFF" stroke-width="1.3"/>'
         f'<circle cx="{LEG_X+22}" cy="{lgy-9}" r="2.5" fill="#FFFFFF"/>')
s.append(txt(LEG_X+34, lgy, "Subject Property", size=11.5, fill=INK, weight="700", ls="0.2",
             anchor="start", halo=False, family="'Helvetica Neue', Arial, sans-serif"))
s.append(f'<circle cx="{LEG_X+178}" cy="{lgy-5}" r="8.5" fill="{METRO}"/>'
         f'<text x="{LEG_X+178}" y="{lgy-1}" text-anchor="middle" font-size="11" font-weight="800" '
         f'fill="#FFFFFF" font-family="Georgia, serif">M</text>')
s.append(txt(LEG_X+192, lgy, "Metro", size=11.5, fill=INK, weight="700", ls="0.2",
             anchor="start", halo=False, family="'Helvetica Neue', Arial, sans-serif"))
s.append(f'<circle cx="{LEG_X+250}" cy="{lgy-5}" r="4.6" fill="{GOLD}" stroke="#FFFFFF" stroke-width="1.2"/>')
s.append(txt(LEG_X+260, lgy, "Hotel", size=11.5, fill=INK, weight="700", ls="0.2",
             anchor="start", halo=False, family="'Helvetica Neue', Arial, sans-serif"))
# scale bar
sby=LEG_Y+46; sbx=LEG_X+20; sbw=92
s.append(f'<line x1="{sbx}" y1="{sby}" x2="{sbx+sbw}" y2="{sby}" stroke="{INK}" stroke-width="2.4"/>'
         f'<line x1="{sbx}" y1="{sby-4}" x2="{sbx}" y2="{sby+4}" stroke="{INK}" stroke-width="2.4"/>'
         f'<line x1="{sbx+sbw}" y1="{sby-4}" x2="{sbx+sbw}" y2="{sby+4}" stroke="{INK}" stroke-width="2.4"/>')
s.append(txt(sbx, sby+15, "0", size=10, fill=INK_SOFT, weight="600", anchor="middle", halo=False, family="'Georgia', serif"))
s.append(txt(sbx+sbw, sby+15, "¼ mile", size=10, fill=INK_SOFT, weight="500", ls="0.3", anchor="middle", halo=False, family="'Georgia', serif"))

# hotels caption plate (bottom center-right)
HCX,HCY,HCW,HCH = 360, 748, 380, 30
s.append(f'<g filter="url(#soft)"><rect x="{HCX}" y="{HCY}" width="{HCW}" height="{HCH}" rx="9" '
         f'fill="#FFFFFF" fill-opacity="0.95" stroke="{STREET_ED}" stroke-width="1"/></g>')
s.append(f'<circle cx="{HCX+18}" cy="{HCY+HCH/2:.0f}" r="4.6" fill="{GOLD}" stroke="#FFFFFF" stroke-width="1.3"/>')
s.append(f'<text x="{HCX+32}" y="{HCY+HCH/2+4:.0f}" font-size="11.5" font-family="\'Georgia\', serif">'
         f'<tspan fill="{GOLD_DK}" font-weight="700" letter-spacing="1">LUXURY HOTELS&#160;&#160;</tspan>'
         f'<tspan fill="{INK_SOFT}">Ritz-Carlton · Park Hyatt · Fairmont · Westin</tspan></text>')

# editorial frame
s.append(f'<rect x="15" y="15" width="{VBW-30}" height="{VBH-30}" fill="none" '
         f'stroke="{GOLD_LINE}" stroke-width="1" stroke-opacity="0.30"/>')

# =============================================================================
#  DEFS + ASSEMBLE
# =============================================================================
defs = ('<defs>'
        f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{SKY_TOP}"/><stop offset="1" stop-color="{SKY_BOT}"/></linearGradient>'
        f'<radialGradient id="ground" cx="0.5" cy="0.42" r="0.75">'
        f'<stop offset="0" stop-color="{GROUND}"/><stop offset="1" stop-color="{GROUND2}"/></radialGradient>'
        f'<radialGradient id="goldglow" cx="0.5" cy="0.5" r="0.5">'
        f'<stop offset="0" stop-color="{GOLD_HI}" stop-opacity="0.95"/>'
        f'<stop offset="1" stop-color="{GOLD_HI}" stop-opacity="0"/></radialGradient>'
        f'<radialGradient id="goldpool" cx="0.5" cy="0.5" r="0.5">'
        f'<stop offset="0" stop-color="#F7CE72" stop-opacity="0.8"/>'
        f'<stop offset="0.55" stop-color="#EFC066" stop-opacity="0.28"/>'
        f'<stop offset="1" stop-color="#EFC066" stop-opacity="0"/></radialGradient>'
        f'<radialGradient id="crownglow" cx="0.5" cy="0.5" r="0.5">'
        f'<stop offset="0" stop-color="#FFE9B4" stop-opacity="0.75"/>'
        f'<stop offset="0.6" stop-color="#FBDE95" stop-opacity="0.18"/>'
        f'<stop offset="1" stop-color="#FBDE95" stop-opacity="0"/></radialGradient>'
        # lit-face gradient: gold at top -> deeper amber toward the base
        f'<linearGradient id="goldface" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{GOLD_MID}"/>'
        f'<stop offset="0.55" stop-color="{GOLD_MID}"/>'
        f'<stop offset="1" stop-color="{GOLD_MID2}"/></linearGradient>'
        f'<radialGradient id="vign" cx="0.48" cy="0.40" r="0.78">'
        f'<stop offset="0" stop-color="#000000" stop-opacity="0"/>'
        f'<stop offset="0.62" stop-color="#000000" stop-opacity="0"/>'
        f'<stop offset="1" stop-color="#3A2E1C" stop-opacity="0.16"/></radialGradient>'
        f'<radialGradient id="herohalo" cx="0.5" cy="0.5" r="0.5">'
        f'<stop offset="0" stop-color="#FBE6B0" stop-opacity="0.55"/>'
        f'<stop offset="0.55" stop-color="#F4D488" stop-opacity="0.14"/>'
        f'<stop offset="1" stop-color="#F4D488" stop-opacity="0"/></radialGradient>'
        f'<radialGradient id="haze" cx="0.5" cy="0.5" r="0.5">'
        f'<stop offset="0" stop-color="#F6EFE2" stop-opacity="0.42"/>'
        f'<stop offset="0.5" stop-color="#F2E9D8" stop-opacity="0.20"/>'
        f'<stop offset="1" stop-color="#F2E9D8" stop-opacity="0"/></radialGradient>'
        '<filter id="soft" x="-40%" y="-40%" width="180%" height="180%">'
        '<feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#000" flood-opacity="0.24"/></filter>'
        '<filter id="cardshadow" x="-40%" y="-40%" width="180%" height="180%">'
        '<feDropShadow dx="0" dy="3" stdDeviation="4.5" flood-color="#3A2A12" flood-opacity="0.22"/></filter>'
        '<filter id="dotshadow" x="-80%" y="-80%" width="260%" height="260%">'
        '<feDropShadow dx="0" dy="1.4" stdDeviation="1.6" flood-color="#000" flood-opacity="0.30"/></filter>'
        '<filter id="pillshadow" x="-60%" y="-60%" width="220%" height="220%">'
        '<feDropShadow dx="0" dy="1" stdDeviation="1.6" flood-color="#4A3A1E" flood-opacity="0.16"/></filter>'
        '<filter id="blur" x="-30%" y="-30%" width="160%" height="160%">'
        '<feGaussianBlur stdDeviation="4"/></filter>'
        '</defs>')

html = (f'<!doctype html><html><head><meta charset="utf-8"><style>'
        f'*{{margin:0;padding:0}}body{{width:{VBW}px;height:{VBH}px;overflow:hidden;background:{SKY_TOP};}}'
        f'</style></head><body>'
        f'<svg width="{VBW}" height="{VBH}" viewBox="0 0 {VBW} {VBH}" xmlns="http://www.w3.org/2000/svg">'
        f'{defs}{"".join(s)}</svg></body></html>')

hp = os.path.join(tempfile.gettempdir(), "iso_map.html")
open(hp,"w").write(html)
tmp = os.path.join(tempfile.gettempdir(), "iso_map_raw.png")
os.makedirs(OUT_DIR, exist_ok=True)
out = os.path.join(OUT_DIR, "location_map.png")

subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
                "--force-device-scale-factor=2", f"--window-size={VBW},940",
                f"--screenshot={tmp}", f"file://{hp}"],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

from PIL import Image
img = Image.open(tmp).convert("RGB").crop((0,0,2330,1600))
img.save(out)
print("wrote", out, img.size)
