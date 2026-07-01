#!/usr/bin/env python3
"""
Build the 2300 N Street, NW – Investment Overview (Confidential Equity Memorandum).

Repurposes the Lincoln Property Company "Investment Overview" PowerPoint template
(supplied as a PDF export populated with a different asset – Chesapeake Trade Center)
and re-skins / re-populates it for the 2300 N Street, NW recapitalization.

All figures are sourced from:
  - Eastdil Secured "ES Opinion of Value" BOV (Jun-2026)
  - CoStar property + lease-comp + sale-comp + construction reports (7/1/2026)
  - LPC / Oaktree ownership email (loan balance $100M)
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

# ----------------------------------------------------------------------------- brand
GOLD      = RGBColor(0xF5, 0xB4, 0x00)   # Lincoln gold / amber
BLACK     = RGBColor(0x00, 0x00, 0x00)
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
DARK      = RGBColor(0x26, 0x26, 0x26)   # title / body text
GREY_TXT  = RGBColor(0x59, 0x59, 0x59)
ROW_GREY  = RGBColor(0xED, 0xED, 0xED)   # alternating table row
HDR_BROWN = RGBColor(0x3D, 0x30, 0x00)   # dark text on gold header
LINE_GREY = RGBColor(0xBF, 0xBF, 0xBF)
PURPLE    = RGBColor(0xB0, 0xA4, 0xC6)   # section-divider background
PURPLE_LT = RGBColor(0xBE, 0xB2, 0xD2)   # faint wordmark on divider
PANEL     = RGBColor(0x1A, 0x1A, 0x1A)   # photo-placeholder panel
PH_GREY   = RGBColor(0xD9, 0xD9, 0xD9)

TITLE_FONT = "Calibri Light"
BODY_FONT  = "Calibri"
SERIF_FONT = "Georgia"          # approximates the "Lincoln" serif wordmark

EMU_W, EMU_H = Inches(10), Inches(5.625)   # 960 x 540 pt (16:9)

prs = Presentation()
prs.slide_width  = EMU_W
prs.slide_height = EMU_H
BLANK = prs.slide_layouts[6]

# ----------------------------------------------------------------------------- helpers
def slide():
    return prs.slides.add_slide(BLANK)

def rect(s, x, y, w, h, fill, line=None):
    sp = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    sp.fill.solid(); sp.fill.fore_color.rgb = fill
    if line is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line; sp.line.width = Pt(0.75)
    sp.shadow.inherit = False
    return sp

def bg(s, color):
    rect(s, 0, 0, EMU_W, EMU_H, color)

def txt(s, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
        space_after=None, line_spacing=None, wrap=True):
    """runs: list of paragraphs; each paragraph is a list of (text, size, color, bold, italic, font) tuples."""
    tb = s.shapes.add_textbox(x, y, w, h); tf = tb.text_frame
    tf.word_wrap = wrap
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, para in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        if space_after is not None: p.space_after = Pt(space_after)
        if line_spacing is not None: p.line_spacing = line_spacing
        for (t, sz, col, bold, ital, fnt) in para:
            r = p.add_run(); r.text = t
            r.font.size = Pt(sz); r.font.color.rgb = col
            r.font.bold = bold; r.font.italic = ital; r.font.name = fnt
    return tb

def R(t, sz, col=DARK, bold=False, ital=False, fnt=BODY_FONT):
    return (t, sz, col, bold, ital, fnt)

def content_header(s, title, page_num):
    """Gold accent tab + title + footer, matching the template content pages."""
    rect(s, Inches(0.42), Inches(0.14), Inches(1.45), Inches(0.22), GOLD)
    txt(s, Inches(0.40), Inches(0.30), Inches(9), Inches(0.75),
        [[R(title, 32, DARK, False, False, TITLE_FONT)]])
    footer(s, page_num)

def footer(s, page_num):
    ln = s.shapes.add_connector(2, Inches(0.42), Inches(5.28), Inches(9.58), Inches(5.28))
    ln.line.color.rgb = LINE_GREY; ln.line.width = Pt(0.75)
    txt(s, Inches(0.42), Inches(5.32), Inches(4), Inches(0.25),
        [[R("Lincoln Property Company", 8.5, GREY_TXT)]])
    txt(s, Inches(5.5), Inches(5.32), Inches(4.08), Inches(0.25),
        [[R(f"Confidential: Not For Distribution      |      {page_num}", 8.5, GREY_TXT)]],
        align=PP_ALIGN.RIGHT)

def set_cell(cell, text, size, color, bold=False, fill=None, align=PP_ALIGN.LEFT,
             ital=False, font=BODY_FONT, anchor=MSO_ANCHOR.MIDDLE):
    cell.vertical_anchor = anchor
    cell.margin_left = Inches(0.06); cell.margin_right = Inches(0.05)
    cell.margin_top = Inches(0.02); cell.margin_bottom = Inches(0.02)
    if fill is not None:
        cell.fill.solid(); cell.fill.fore_color.rgb = fill
    else:
        cell.fill.background()
    tf = cell.text_frame; tf.word_wrap = True
    p = tf.paragraphs[0]; p.alignment = align
    for j, line in enumerate(text.split("\n")):
        pp = p if j == 0 else tf.add_paragraph()
        pp.alignment = align
        r = pp.add_run(); r.text = line
        r.font.size = Pt(size); r.font.color.rgb = color
        r.font.bold = bold; r.font.italic = ital; r.font.name = font

def no_table_style(table):
    """Strip the default banded style so our manual fills show."""
    tbl = table._tbl
    for el in tbl.findall(qn('a:tblPr')):
        el.set('firstRow', '0'); el.set('bandRow', '0')

# ============================================================ SLIDE 1 – COVER
s = slide(); bg(s, BLACK)
# photo panel on the right (placeholder for the property photograph)
rect(s, Inches(4.55), 0, Inches(5.45), EMU_H, PANEL)
txt(s, Inches(4.55), Inches(2.5), Inches(5.45), Inches(0.6),
    [[R("[ Insert 2300 N Street property photograph ]", 11, RGBColor(0x8C,0x8C,0x8C), False, True)]],
    align=PP_ALIGN.CENTER)
# left text stack
txt(s, Inches(0.55), Inches(0.95), Inches(3.8), Inches(0.9),
    [[R("Lincoln", 40, GOLD, True, False, SERIF_FONT)]])
txt(s, Inches(0.6), Inches(1.95), Inches(3.8), Inches(0.5),
    [[R("Investment Overview", 20, WHITE, False, False, TITLE_FONT)]])
txt(s, Inches(0.6), Inches(2.65), Inches(3.9), Inches(1.2),
    [[R("2300 N Street, NW", 38, WHITE, True, False, TITLE_FONT)]])
txt(s, Inches(0.62), Inches(3.85), Inches(3.8), Inches(0.7),
    [[R("Washington, DC", 18, WHITE)],
     [R("West End Submarket", 18, WHITE)]], space_after=2)
txt(s, Inches(0.62), Inches(4.65), Inches(3.8), Inches(0.3),
    [[R("Lincoln Property Company  |  Oaktree Capital Management", 11, WHITE)]])
txt(s, Inches(0.62), Inches(5.15), Inches(3.8), Inches(0.3),
    [[R("Confidential Equity Memorandum", 11, WHITE, False, True)]])

# ============================================================ SLIDE 2 – CONTENTS
s = slide(); bg(s, BLACK)
txt(s, Inches(0.42), Inches(1.85), Inches(2.6), Inches(0.8),
    [[R("Contents", 40, GOLD, False, False, TITLE_FONT)]])
items = [("Property Overview", "03"), ("The Opportunity", "05"),
         ("Tenancy", "07"), ("Market", "09")]
y = 1.75
for name, pg in items:
    txt(s, Inches(3.6), Inches(y), Inches(5), Inches(0.5),
        [[R(name, 22, WHITE, False, False, TITLE_FONT)]])
    txt(s, Inches(8.15), Inches(y), Inches(1.1), Inches(0.5),
        [[R(pg, 22, WHITE, False, False, TITLE_FONT)]])
    y += 0.62

# ============================================================ SLIDE 3 – PROPERTY OVERVIEW
s = slide(); bg(s, WHITE)
content_header(s, "Property Overview", 3)
txt(s, Inches(0.42), Inches(1.05), Inches(5.45), Inches(0.95),
    [[R("2300 N Street is a 282,943 SF, 8-story Class A office building in Washington, DC's "
        "supply-constrained West End submarket. Built in 1986 and renovated in 2018, the asset is "
        "87.8% leased with 9.4 years of WALT and best-in-class amenities.", 12, DARK)]],
    line_spacing=1.05)

# property description table
rows = [
    ("Size (SF):", "282,943", "Submarket:", "West End"),
    ("Stories:", "8", "% Leased:", "87.8%"),
    ("Year Built / Reno:", "1986 / 2018", "In-Place WALT:", "9.4 Years"),
    ("Typical Floor:", "38,391 SF", "Parking:", "300 spaces (0.98/1,000 SF)"),
    ("Building Class:", "Class A", "Zoning:", "MU-10"),
    ("Land Area:", "1.13 AC", "Metro:", "Foggy Bottom-GWU (9-min walk)"),
    ("Amenities:", "Fitness, Roof Terrace,\nConferencing, Restaurant", "Ownership:", "Lincoln Property Co. / Oaktree"),
]
tx, ty, tw = Inches(0.42), Inches(2.05), Inches(5.35)
rowh = Inches(0.40)
tbl_shape = s.shapes.add_table(len(rows)+1, 4, tx, ty, tw, rowh*(len(rows)+1))
table = tbl_shape.table; no_table_style(table)
table.columns[0].width = Inches(1.45); table.columns[1].width = Inches(1.30)
table.columns[2].width = Inches(1.15); table.columns[3].width = Inches(1.55)
# header spanning row
hc = table.cell(0, 0); hc.merge(table.cell(0, 3))
set_cell(hc, "Property Description", 12, HDR_BROWN, bold=True, fill=GOLD, align=PP_ALIGN.CENTER)
for i, (a, b, c, d) in enumerate(rows, start=1):
    fill = ROW_GREY if i % 2 == 0 else WHITE
    set_cell(table.cell(i, 0), a, 9.5, DARK, bold=True, fill=fill)
    set_cell(table.cell(i, 1), b, 9.5, DARK, fill=fill)
    set_cell(table.cell(i, 2), c, 9.5, DARK, bold=True, fill=fill)
    set_cell(table.cell(i, 3), d, 9.5, DARK, fill=fill)

# right column: two photo placeholders + amenity note
rect(s, Inches(6.05), Inches(1.05), Inches(3.53), Inches(1.9), PH_GREY)
txt(s, Inches(6.05), Inches(1.9), Inches(3.53), Inches(0.4),
    [[R("[ Property exterior photograph ]", 10, GREY_TXT, False, True)]], align=PP_ALIGN.CENTER)
rect(s, Inches(6.05), Inches(3.05), Inches(3.53), Inches(1.9), PH_GREY)
txt(s, Inches(6.05), Inches(3.9), Inches(3.53), Inches(0.4),
    [[R("[ Roof terrace / lobby photograph ]", 10, GREY_TXT, False, True)]], align=PP_ALIGN.CENTER)

# ============================================================ SLIDE 4 – THE OPPORTUNITY (business plan)
s = slide(); bg(s, WHITE)
content_header(s, "The Opportunity", 4)
txt(s, Inches(0.42), Inches(1.05), Inches(9.15), Inches(0.8),
    [[R("Recapitalize 2300 N Street alongside a new equity partner by acquiring the asset from the "
        "existing lender at a substantial discount to both the $100M loan balance and prior ownership "
        "basis – resetting cost basis ahead of a West End recovery.", 12.5, DARK)]],
    line_spacing=1.05)

# three metric callouts
cards = [
    ("~$65 – 75M", "Eastdil opinion of value\n($230 – $265 PSF)"),
    ("$100M", "Existing loan balance\n(~25 – 35% discount to par)"),
    ("$540 PSF", "Prior ownership basis\n(2021 sale: $152.75M)"),
]
cx = Inches(0.42); cw = Inches(2.95); gap = Inches(0.16)
for i, (big, sub) in enumerate(cards):
    x = Emu(int(cx) + i * (int(cw) + int(gap)))
    rect(s, x, Inches(1.95), cw, Inches(1.15), ROW_GREY)
    rect(s, x, Inches(1.95), cw, Inches(0.09), GOLD)
    txt(s, x, Inches(2.18), cw, Inches(0.55),
        [[R(big, 26, DARK, True)]], align=PP_ALIGN.CENTER)
    txt(s, x, Inches(2.70), cw, Inches(0.4),
        [[R(sub, 10.5, GREY_TXT)]], align=PP_ALIGN.CENTER)

# business-plan bullets
def bullets(s, x, y, w, h, items, size=12, gap=6, lh=1.02):
    paras = []
    for it in items:
        paras.append([R("▪  ", size, GOLD, True), R(it, size, DARK)])
    txt(s, x, y, w, h, paras, space_after=gap, line_spacing=lh)

txt(s, Inches(0.42), Inches(3.35), Inches(9), Inches(0.35),
    [[R("Business Plan", 15, DARK, True, False, TITLE_FONT)]])
bullets(s, Inches(0.42), Inches(3.75), Inches(9.15), Inches(1.5), [
    "Acquire at a reset basis of ~$230–265 PSF, a ~50% discount to the prior $540 PSF basis and "
    "well inside $21.5M ($76 PSF) of recent base-building and amenity capital already in place.",
    "Lease up near-term vacancy from 76.8% (post Aspen downsize / Plan International termination) to a "
    "~90% stabilized occupancy; ~40,000 SF of leasing underwritten in the first three years.",
    "Fund ~$3.0M ($10 PSF) of near-term building capital plus outstanding TI/LCs; ~$1.3M credited at close.",
    "Underwritten returns of an 18–20% levered IRR and a 12–14% stabilized return on cost at "
    "a 9.5% exit cap ($357 PSF residual).",
])

# ============================================================ SLIDE 5 – VALUATION
s = slide(); bg(s, WHITE)
content_header(s, "Valuation Summary", 5)
txt(s, Inches(0.42), Inches(1.05), Inches(9.15), Inches(0.5),
    [[R("Eastdil Secured levered-IRR sensitivity – assumes a 5-year hold beginning October 2026, "
        "65% LTV / 65% future funding at SOFR + 3.75% (7.43% coupon).", 12, DARK)]], line_spacing=1.03)

# sensitivity table: rows = price, cols = exit cap
exit_caps = ["9.00%", "9.25%", "9.50%", "9.75%", "10.00%"]
price_rows = [
    ("$75,000,000", ["17.51%", "16.37%", "15.24%", "14.12%", "13.01%"]),
    ("$72,500,000", ["19.33%", "18.22%", "17.12%", "16.03%", "14.96%"]),
    ("$70,000,000", ["21.19%", "20.10%", "19.03%", "17.97%", "16.93%"]),
    ("$67,500,000", ["23.08%", "22.02%", "20.98%", "19.95%", "18.93%"]),
    ("$65,000,000", ["25.02%", "23.99%", "22.96%", "21.96%", "20.97%"]),
]
tw = Inches(6.0); tx = Inches(0.42); ty = Inches(1.95)
tshape = s.shapes.add_table(len(price_rows)+2, len(exit_caps)+1, tx, ty, tw, Inches(2.4))
t = tshape.table; no_table_style(t)
t.columns[0].width = Inches(1.5)
for c in range(1, len(exit_caps)+1):
    t.columns[c].width = Inches(0.9)
# top header spanning "Exit Cap Rate"
top = t.cell(0, 1); top.merge(t.cell(0, len(exit_caps)))
set_cell(top, "Exit Cap Rate", 10.5, HDR_BROWN, bold=True, fill=GOLD, align=PP_ALIGN.CENTER)
set_cell(t.cell(0, 0), "Levered IRR", 9.5, WHITE, bold=True, fill=DARK, align=PP_ALIGN.CENTER)
for c, cap in enumerate(exit_caps, start=1):
    set_cell(t.cell(1, c), cap, 9.5, DARK, bold=True, fill=ROW_GREY, align=PP_ALIGN.CENTER)
set_cell(t.cell(1, 0), "Price", 9.5, DARK, bold=True, fill=ROW_GREY, align=PP_ALIGN.CENTER)
for r, (price, vals) in enumerate(price_rows, start=2):
    set_cell(t.cell(r, 0), price, 9.5, DARK, bold=True, fill=WHITE, align=PP_ALIGN.CENTER)
    for c, v in enumerate(vals, start=1):
        hl = (price == "$70,000,000" and exit_caps[c-1] == "9.50%")
        set_cell(t.cell(r, c), v, 9.5, HDR_BROWN if hl else DARK, bold=hl,
                 fill=GOLD if hl else WHITE, align=PP_ALIGN.CENTER)

# right: key metrics at ~$70M
txt(s, Inches(6.7), Inches(1.9), Inches(2.9), Inches(0.35),
    [[R("At ~$70.0M / $247 PSF", 13, DARK, True, False, TITLE_FONT)]])
metrics = [
    ("In-Place Cap Rate (87.8% occ)", "11.93%"),
    ("Adjusted Cap Rate (76.8% occ)", "8.86%"),
    ("Stabilized Return on Cost (Yr 5)", "12.04%"),
    ("Average Cash Yield", "9.42%"),
    ("Levered IRR", "19.03%"),
    ("Equity Multiple", "2.14x"),
    ("Reversion PSF (9.50% exit)", "$357"),
]
my = 2.35
for lab, val in metrics:
    txt(s, Inches(6.7), Inches(my), Inches(2.2), Inches(0.3), [[R(lab, 9.5, GREY_TXT)]])
    txt(s, Inches(8.9), Inches(my), Inches(0.7), Inches(0.3),
        [[R(val, 9.5, DARK, True)]], align=PP_ALIGN.RIGHT)
    my += 0.34
txt(s, Inches(0.42), Inches(4.55), Inches(6.0), Inches(0.7),
    [[R("Note: Eastdil assumes Jackson & Campbell vacates at lease expiration (Aug-2035) – ~50 bps "
        "of impact on residual pricing – and excludes Aspen's Jan-2027 giveback and Plan "
        "International's Nov-2027 termination from in-place NOI. Source: Eastdil Secured BOV, Jun-2026.",
        8, GREY_TXT, False, True)]], line_spacing=1.0)

# ============================================================ SLIDE 6 – TENANCY DIVIDER
def divider2(title):
    s = slide(); bg(s, PURPLE)
    txt(s, Inches(1.1), Inches(0.6), Inches(9), Inches(4.5),
        [[R("Lincoln", 200, PURPLE_LT, True, False, SERIF_FONT)]], wrap=False,
        anchor=MSO_ANCHOR.MIDDLE)
    txt(s, Inches(0.55), Inches(2.2), Inches(5), Inches(1.0),
        [[R(title, 44, BLACK, False, False, TITLE_FONT)]])
    return s
divider2("Tenancy")

# ============================================================ SLIDE 7 – TENANT OVERVIEW
s = slide(); bg(s, WHITE)
content_header(s, "Tenant Overview", 7)
cols = ["Tenant", "Floors", "SF", "% NRA", "Expiration", "Gross Rent ($/SF)"]
data = [
    ("Aspen Institute ¹", "6-8", "91,395", "32.3%", "May-41", "$71.56"),
    ("BlackIvy / CINQCARE", "2 & 6", "25,720", "9.1%", "Aug-34", "$55.87"),
    ("Bezos", "4-5", "23,874", "8.4%", "May-32", "$28.31"),
    ("Jackson & Campbell ²", "3", "23,735", "8.4%", "Aug-35", "$51.47"),
    ("Two Birds", "1", "17,275", "6.1%", "Jun-38", "$52.53"),
    ("Holtzman Vogel", "6", "16,722", "5.9%", "Nov-36", "$57.32"),
    ("Plan International ³", "3", "15,485", "5.5%", "Oct-27", "$67.03"),
    ("Compass Point", "4", "10,034", "3.5%", "Sep-37", "$53.50"),
    ("Capital Power", "5", "6,562", "2.3%", "Jun-31", "$55.00"),
    ("Bar Angie", "1", "4,435", "1.6%", "Mar-40", "$44.25"),
    ("Total Leased", "–", "248,300", "87.8%", "9.4 yrs", "$58.26"),
]
tx, ty, tw = Inches(0.42), Inches(1.05), Inches(5.55)
tshape = s.shapes.add_table(len(data)+2, len(cols), tx, ty, tw, Inches(3.9))
t = tshape.table; no_table_style(t)
widths = [1.55, 0.7, 0.9, 0.7, 0.95, 1.15]
for i, w in enumerate(widths): t.columns[i].width = Inches(w)
# gold banner row
ban = t.cell(0, 0); ban.merge(t.cell(0, len(cols)-1))
set_cell(ban, "Tenant Summary", 11, HDR_BROWN, bold=True, fill=GOLD, align=PP_ALIGN.CENTER)
for c, h in enumerate(cols):
    set_cell(t.cell(1, c), h, 9, DARK, bold=True, fill=WHITE,
             align=PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER)
for r, row in enumerate(data, start=2):
    total = row[0] == "Total Leased"
    fill = ROW_GREY if (r % 2 == 0) else WHITE
    if total: fill = GOLD
    for c, val in enumerate(row):
        set_cell(t.cell(r, c), val, 8.7, HDR_BROWN if total else DARK, bold=total, fill=fill,
                 align=PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER)

# right narrative
txt(s, Inches(6.2), Inches(1.05), Inches(3.4), Inches(0.35),
    [[R("Key Considerations", 14, DARK, True, False, TITLE_FONT)]])
bullets(s, Inches(6.2), Inches(1.45), Inches(3.4), Inches(3.4), [
    "88% leased today, stepping to 77% after Aspen's 6th-floor downsize – nearly 10 years of WALT.",
    "65,000+ SF (23% of NRA) of new leasing since Q4 2024; ~$1.3M of TI/LCs credited to a buyer at close.",
    "Anchor Aspen Institute extended through May-2041 across floors 6–8.",
    "Roll risk to watch: Plan International termination (Nov-2027) and Jackson & Campbell sublease "
    "marketing ahead of its Aug-2035 expiry.",
], size=10.5, gap=8, lh=1.02)
txt(s, Inches(0.42), Inches(5.02), Inches(9), Inches(0.25),
    [[R("¹ Gives back 15,536 SF Dec-2026, extends through May-2041.   "
        "² 100% of space on sublease market; ES assumes vacate at expiry.   "
        "³ Subleased; termination effective Nov-2027.", 7.5, GREY_TXT, False, True)]])

# ============================================================ SLIDE 8 – LEASE COMPARABLES
s = slide(); bg(s, WHITE)
content_header(s, "Lease Comparables", 8)
txt(s, Inches(0.42), Inches(1.02), Inches(9.1), Inches(0.4),
    [[R("Recent West End / CBD office leasing – asking rents of $35.00 – $62.50 FSG "
        "(18 deals; $47.66 average). Source: CoStar, 7/1/2026.", 11.5, DARK)]])
lcols = ["#", "Property / Address", "Submarket", "SF Leased", "Floor", "Sign Date", "Rent", "Type"]
lcomps = [
    ("S", "2300 N Street, NW (Subject)", "West End", "–", "–", "–", "$58.34 FS", "Asking"),
    ("1", "1255 23rd St NW", "West End", "13,634", "2nd", "6/24/26", "$35.00 FS", "New"),
    ("2", "1501 M St NW", "CBD", "4,615", "4th", "6/24/26", "$59.00 FS", "New"),
    ("3", "The Lion Building – 1233 20th St NW", "CBD", "3,995", "7th", "6/22/26", "$48.00 FS", "New"),
    ("4", "1660 L St NW", "CBD", "1,843", "8th", "6/22/26", "$48.00 FS", "New"),
    ("5", "1825 K St NW", "CBD", "1,934", "9th", "6/15/26", "$49.00 FS", "New"),
    ("6", "One Thomas Circle – 1 Thomas Cir NW", "CBD", "5,897", "10th", "6/15/26", "$49.00 FS", "New"),
    ("7", "The Foundry – 1055 T. Jefferson St NW", "Georgetown", "6,467", "3rd", "6/12/26", "$53.00 FS", "New"),
    ("8", "Waterfront Center – 1010 Wisconsin NW", "Georgetown", "3,440", "5th", "6/8/26", "$41.00 FS", "New"),
    ("9", "The Row on 19th – 1900 M St NW", "CBD", "9,645", "4th", "5/26/26", "$59.00 FS", "New"),
    ("10", "The Demonet – 1155 Connecticut NW", "CBD", "6,624", "12th", "5/13/26", "$62.50 FS", "New"),
    ("11", "1150 Connecticut Ave NW", "CBD", "3,481", "7th", "5/11/26", "$51.00 FS", "New"),
]
tx, ty = Inches(0.42), Inches(1.55)
tshape = s.shapes.add_table(len(lcomps)+1, len(lcols), tx, ty, Inches(9.16), Inches(3.5))
t = tshape.table; no_table_style(t)
lw = [0.4, 3.15, 1.15, 1.0, 0.7, 1.0, 1.06, 0.7]
for i, w in enumerate(lw): t.columns[i].width = Inches(w)
for c, h in enumerate(lcols):
    set_cell(t.cell(0, c), h, 9, WHITE, bold=True, fill=DARK,
             align=PP_ALIGN.LEFT if c == 1 else PP_ALIGN.CENTER)
for r, row in enumerate(lcomps, start=1):
    subj = row[0] == "S"
    fill = GOLD if subj else (ROW_GREY if r % 2 == 0 else WHITE)
    for c, val in enumerate(row):
        set_cell(t.cell(r, c), val, 8.6, HDR_BROWN if subj else DARK, bold=subj, fill=fill,
                 align=PP_ALIGN.LEFT if c == 1 else PP_ALIGN.CENTER)

# ============================================================ SLIDE 9 – MARKET DIVIDER
divider2("Market")

# ============================================================ SLIDE 10 – MARKET OVERVIEW
s = slide(); bg(s, WHITE)
content_header(s, "Market Overview", 10)
txt(s, Inches(0.42), Inches(1.02), Inches(9.15), Inches(1.15),
    [[R("Washington, DC posted the 3rd-highest U.S. office volume in 2025, with pricing bands re-forming "
        "and trophy fundamentals accelerating. Tier-one DC office vacancy is just 8.7% against a near-zero "
        "supply pipeline, while 6.9M SF of office-to-residential/hotel conversions are removing supply.", 12, DARK)],
     [R("In the West End, the planned residential conversion of nearby 1255 23rd Street injects ~100,000 SF "
        "of tenant demand and cuts submarket availability by ~7.2% – a direct tailwind for 2300 N Street's "
        "lease-up.", 12, DARK)]], space_after=6, line_spacing=1.03)

txt(s, Inches(0.42), Inches(2.95), Inches(9), Inches(0.3),
    [[R("Select DC Office Sale Comparables", 13, DARK, True, False, TITLE_FONT)]])
scols = ["Property / Address", "Yr Built", "SF", "Vacancy", "Price", "$/SF", "Sale Date"]
scomps = [
    ("2001 M St NW", "1986", "284,994", "7.1%", "$163.3M", "$573", "Jan-26"),
    ("2445 M St NW", "1986", "299,668", "11.9%", "$101.0M", "$337", "Mar-26"),
    ("City Center – 1401 H St NW", "1992", "371,903", "13.6%", "$118.1M", "$318", "Mar-25"),
    ("2101 L St NW", "1975", "384,000", "22.8%", "$110.1M", "$287", "Dec-24"),
    ("1400 K St NW", "1982", "197,000", "26.6%", "$35.5M", "$180", "Oct-25"),
    ("Watergate 600 – 600 New Hampshire NW", "1967", "316,000", "29.4%", "$52.5M", "$166", "Mar-26"),
]
tx, ty = Inches(0.42), Inches(3.35)
tshape = s.shapes.add_table(len(scomps)+2, len(scols), tx, ty, Inches(9.16), Inches(1.75))
t = tshape.table; no_table_style(t)
sw = [3.0, 0.85, 1.15, 1.0, 1.1, 0.86, 1.2]
for i, w in enumerate(sw): t.columns[i].width = Inches(w)
for c, h in enumerate(scols):
    set_cell(t.cell(0, c), h, 8.8, WHITE, bold=True, fill=DARK,
             align=PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER)
for r, row in enumerate(scomps, start=1):
    fill = ROW_GREY if r % 2 == 0 else WHITE
    for c, val in enumerate(row):
        set_cell(t.cell(r, c), val, 8.6, DARK, fill=fill,
                 align=PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER)
# summary stat row
avg = ("DC Office Avg (report set)", "1980", "261,856", "15.9%", "$82.9M", "$317", "8.7% cap")
rr = len(scomps)+1
for c, val in enumerate(avg):
    set_cell(t.cell(rr, c), val, 8.6, HDR_BROWN, bold=True, fill=GOLD,
             align=PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER)

# ============================================================ SLIDE 11 – CONTACT
s = slide(); bg(s, BLACK)
txt(s, Inches(0.42), Inches(1.55), Inches(3), Inches(0.8),
    [[R("Contact", 40, GOLD, False, False, TITLE_FONT)]])
contacts = [
    ("Matt Nicholson", "Executive Vice President", "mnicholson@lpc.com"),
    ("Jackson Coviello", "Assistant Vice President", "jcoviello@lpc.com"),
    ("Jared Hicks", "Analyst", "jahicks@lpc.com"),
]
cx = 0.62; cw = 3.0
for i, (nm, title, email) in enumerate(contacts):
    x = Inches(cx + i*cw)
    txt(s, x, Inches(3.0), Inches(cw-0.1), Inches(0.4), [[R(nm, 19, WHITE, False, False, TITLE_FONT)]])
    txt(s, x, Inches(3.4), Inches(cw-0.1), Inches(0.3), [[R(title, 12, WHITE)]])
    txt(s, x, Inches(3.7), Inches(cw-0.1), Inches(0.3), [[R(email, 12, WHITE)]])
txt(s, Inches(0.62), Inches(4.55), Inches(6), Inches(1.0),
    [[R("Lincoln Property Company", 10, WHITE)],
     [R("101 Constitution Ave. NW, Suite 325 East", 10, WHITE)],
     [R("Washington, DC 20001", 10, WHITE)],
     [R("www.lpc.com", 10, WHITE)]], space_after=3)

out = "/home/user/Underwrite-Copilot/equity-deck/2300_N_Street_NW_Investment_Overview.pptx"
prs.save(out)
print("saved", out, "with", len(prs.slides._sldIdLst), "slides")
