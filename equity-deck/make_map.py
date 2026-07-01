#!/usr/bin/env python3
"""Polished, geographically-accurate West End (DC) locator map for 2300 N Street, NW.
Builds HTML/SVG and screenshots it with headless Chromium -> assets/location_map.png
(aspect 5.75:3.95 to match the Location slide)."""
import os, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
VBW, VBH = 1165, 800

LAND="#ECE9E2"; PARK="#D3E1C9"; WATER="#BFD6E6"
ST_CASE="#D7D2C8"; ST_FILL="#FFFFFF"; AVE_FILL="#F7EFD2"; AVE_CASE="#E4D6A4"
GOLD="#F5B400"; GOLDLINE="#CE9200"; INK="#2B2B2B"; HOOD="#7C7565"; STLBL="#AEA89D"
METRO="#262626"; RED="#BF0D3E"; BLUE="#0072CE"; ORANGE="#F7941E"; SILVER="#A2A4A1"

# grid geometry (with inner margins so nothing clips)
V=[(250,"25th"),(400,"24th"),(560,"23rd"),(715,"22nd"),(865,"21st"),(1010,"20th")]
H=[(160,"P St"),(285,"O St"),(400,"N St"),(515,"M St"),(620,"L St")]
GX0,GX1=205,1050; GY0,GY1=120,705

s=[]
s.append(f'<rect width="{VBW}" height="{VBH}" fill="{LAND}"/>')
# park (west) + river (SW)
s.append(f'<path d="M0,0 L140,0 C112,180 60,300 120,430 C70,560 40,660 0,720 Z" fill="{PARK}"/>')
s.append(f'<path d="M0,590 C120,628 200,700 262,800 L0,800 Z" fill="{WATER}"/>')

def h(y,x0,x1,major=False):
    w=15 if major else 10
    return (f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="{ST_CASE}" stroke-width="{w+3}" stroke-linecap="round"/>'
            f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="{ST_FILL}" stroke-width="{w}" stroke-linecap="round"/>')
def v(x,y0,y1,major=False):
    w=15 if major else 10
    return (f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{y1}" stroke="{ST_CASE}" stroke-width="{w+3}" stroke-linecap="round"/>'
            f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{y1}" stroke="{ST_FILL}" stroke-width="{w}" stroke-linecap="round"/>')
def ave(x0,y0,x1,y1):
    return (f'<line x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" stroke="{AVE_CASE}" stroke-width="16" stroke-linecap="round"/>'
            f'<line x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" stroke="{AVE_FILL}" stroke-width="12" stroke-linecap="round"/>')
for x,_ in V: s.append(v(x,GY0,GY1,major=(x==560)))
for y,_ in H: s.append(h(y,GX0,GX1,major=(y==400)))
# avenues (diagonals) drawn over grid
s.append(ave(430,690,975,205))          # New Hampshire Ave -> Dupont
s.append(ave(430,690,845,752))          # Pennsylvania Ave -> SE

# traffic circles
def circ(cx,cy,r):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r+7}" fill="{ST_FILL}" stroke="{ST_CASE}" stroke-width="3"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{PARK}"/>')
s.append(circ(975,205,25)); s.append(circ(430,690,22))

# subject parcel (block 24th-23rd & N-M), grid-snapped
s.append(f'<rect x="400" y="400" width="160" height="115" fill="{GOLD}" opacity="0.16" stroke="{GOLDLINE}" stroke-width="1.5"/>')

def hood(x,y,t,size=22,anchor="middle",rot=0):
    tr=f' transform="rotate({rot} {x} {y})"' if rot else ""
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" fill="{HOOD}" font-weight="700" letter-spacing="2.5"{tr}>{t}</text>'
s.append(hood(120,180,"GEORGETOWN",19,rot=-62))
s.append(hood(60,730,"POTOMAC RIVER",14,anchor="start",rot=-36))
s.append(hood(975,155,"DUPONT CIRCLE",18))
s.append(hood(1088,400,"CBD",19,rot=90))
s.append(hood(775,320,"WEST END",21))
s.append(hood(690,742,"FOGGY BOTTOM · GWU",16))

# street labels
for x,l in V: s.append(f'<text x="{x+4}" y="110" font-size="12.5" fill="{STLBL}">{l}</text>')
for y,l in H: s.append(f'<text x="1058" y="{y+4}" font-size="12.5" fill="{STLBL}">{l}</text>')
s.append(f'<text x="720" y="292" font-size="12" fill="{STLBL}" transform="rotate(-46 720 292)">New Hampshire Ave</text>')
s.append(f'<text x="650" y="742" font-size="12" fill="{STLBL}" transform="rotate(9 650 742)">Pennsylvania Ave</text>')

# metro markers
def metro(cx,cy,bars):
    g=f'<g filter="url(#sh)"><circle cx="{cx}" cy="{cy}" r="15" fill="{METRO}"/></g>'
    g+=f'<text x="{cx}" y="{cy+6}" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" font-family="Georgia,serif">M</text>'
    n=len(bars); bw=26/n
    for i,c in enumerate(bars):
        g+=f'<rect x="{cx-13+i*bw}" y="{cy+16}" width="{bw}" height="5" rx="1" fill="{c}"/>'
    return g
def chip(x,y,t,anchor="middle"):
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="12.5" font-weight="700" fill="{METRO}">{t}</text>'
# Dupont (Red line) — roundel on the circle, walk chip below
s.append(metro(975,205,[RED])); s.append(chip(975,252,"13-min walk"))
# Foggy Bottom-GWU (Blue/Orange/Silver) — roundel + label to the right
s.append(metro(600,660,[BLUE,ORANGE,SILVER]))
s.append(f'<text x="624" y="656" font-size="13.5" font-weight="700" fill="{METRO}">Foggy Bottom–GWU</text>')
s.append(f'<text x="624" y="674" font-size="12.5" fill="{HOOD}">9-min walk</text>')

# hotels along M St, evenly spaced east of the parcel
hx=[615,675,735,795]
for x in hx: s.append(f'<circle cx="{x}" cy="515" r="6" fill="#B9892E" stroke="#fff" stroke-width="1.5"/>')
s.append(f'<rect x="586" y="533" width="360" height="25" rx="6" fill="#fff" stroke="{ST_CASE}"/>'
         f'<text x="600" y="550" font-size="12.5" fill="{INK}"><tspan font-weight="700">Hotels · </tspan>Ritz-Carlton · Park Hyatt · Fairmont · Westin</text>')

# subject pin
px,py=480,458
s.append(f'<ellipse cx="{px}" cy="{py+3}" rx="14" ry="4.5" fill="#000" opacity="0.18"/>')
s.append(f'<g filter="url(#sh)"><path d="M{px},{py+6} C{px-23},{py-27} {px-23},{py-62} {px},{py-62} C{px+23},{py-62} {px+23},{py-27} {px},{py+6} Z" fill="{GOLD}" stroke="#fff" stroke-width="4"/></g>')
s.append(f'<circle cx="{px}" cy="{py-39}" r="10" fill="#fff"/><circle cx="{px}" cy="{py-39}" r="4.6" fill="{GOLDLINE}"/>')
lbl="2300 N Street, NW"; lw=len(lbl)*9.2+30
s.append(f'<g filter="url(#sh)"><rect x="{px-lw/2}" y="{py+15}" width="{lw}" height="33" rx="8" fill="{INK}"/></g>'
         f'<text x="{px}" y="{py+37}" text-anchor="middle" font-size="17" font-weight="700" fill="#fff">{lbl}</text>')

# north arrow (top-right, clear of labels) + scale bar (bottom-right)
s.append(f'<g transform="translate(1105,95)"><path d="M0,-24 L10,7 L0,0 L-10,7 Z" fill="{INK}"/>'
         f'<path d="M0,-24 L10,7 L0,0 Z" fill="#8a8a8a"/><text x="0" y="24" text-anchor="middle" font-size="14" font-weight="800" fill="{INK}">N</text></g>')
s.append(f'<g transform="translate(70,765)"><line x1="0" y1="0" x2="90" y2="0" stroke="{INK}" stroke-width="2.5"/>'
         f'<line x1="0" y1="-4" x2="0" y2="4" stroke="{INK}" stroke-width="2.5"/><line x1="90" y1="-4" x2="90" y2="4" stroke="{INK}" stroke-width="2.5"/>'
         f'<text x="45" y="-7" text-anchor="middle" font-size="11.5" fill="{HOOD}">¼ mile</text></g>')

defs=('<defs><filter id="sh" x="-40%" y="-40%" width="180%" height="180%">'
      '<feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#000" flood-opacity="0.26"/></filter></defs>')
html=(f'<!doctype html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0}}'
      f'body{{width:{VBW}px;height:{VBH}px;overflow:hidden;font-family:Arial,Helvetica,sans-serif}}</style></head>'
      f'<body><svg width="{VBW}" height="{VBH}" viewBox="0 0 {VBW} {VBH}" xmlns="http://www.w3.org/2000/svg">{defs}{"".join(s)}</svg></body></html>')

hp=os.path.join(tempfile.gettempdir(),"westend_map.html"); open(hp,"w").write(html)
out=os.path.join(HERE,"assets","location_map.png"); os.makedirs(os.path.dirname(out),exist_ok=True)
# render a TALLER window so the full 800-unit height is captured (the viewport
# otherwise clips ~90 units), then crop back to the exact viewBox aspect.
tmp=os.path.join(tempfile.gettempdir(),"westend_raw.png")
subprocess.run([CHROME,"--headless=new","--disable-gpu","--no-sandbox","--hide-scrollbars",
    "--force-device-scale-factor=2",f"--window-size={VBW},{VBH+140}",f"--screenshot={tmp}",f"file://{hp}"],
    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
from PIL import Image
img=Image.open(tmp).convert("RGB").crop((0,0,VBW*2,VBH*2))   # top 1165x800 (x2)
img.save(out)
print("wrote",out,img.size,os.path.getsize(out),"bytes")
