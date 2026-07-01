#!/usr/bin/env python3
"""Generate a polished, geographically-accurate West End (DC) locator map for
2300 N Street, NW. Builds an HTML/SVG map and screenshots it with headless
Chromium -> assets/location_map.png (aspect 5.75:3.95 to match the slide)."""
import os, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
VBW, VBH = 1165, 800          # viewBox (aspect 1.456 == 5.75/3.95)

# ---- palette ----------------------------------------------------------------
LAND="#ECE9E2"; PARK="#D3E1C9"; PARK2="#C7D9BB"; WATER="#BFD6E6"
ST_CASE="#D9D4CB"; ST_FILL="#FFFFFF"; AVE_FILL="#FBEFC9"; AVE_CASE="#E7D9A6"
GOLD="#F5B400"; GOLDLINE="#D99A00"; INK="#2B2B2B"; HOOD="#8A8172"
STLBL="#AEA89D"; METRO="#2A2A2A"

def street_h(y, x0, x1, major=False):
    w = 15 if major else 10
    return (f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="{ST_CASE}" stroke-width="{w+3}" stroke-linecap="round"/>'
            f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="{ST_FILL}" stroke-width="{w}" stroke-linecap="round"/>')
def street_v(x, y0, y1, major=False):
    w = 15 if major else 10
    return (f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{y1}" stroke="{ST_CASE}" stroke-width="{w+3}" stroke-linecap="round"/>'
            f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{y1}" stroke="{ST_FILL}" stroke-width="{w}" stroke-linecap="round"/>')
def avenue(x0,y0,x1,y1):
    return (f'<line x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" stroke="{AVE_CASE}" stroke-width="21" stroke-linecap="round"/>'
            f'<line x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" stroke="{AVE_FILL}" stroke-width="17" stroke-linecap="round"/>')

svg=[]
svg.append(f'<rect x="0" y="0" width="{VBW}" height="{VBH}" fill="{LAND}"/>')

# Rock Creek Park (west edge) + Potomac (SW) --------------------------------
svg.append(f'<path d="M0,0 L150,0 C120,180 60,300 130,430 C80,560 40,650 0,700 Z" fill="{PARK}"/>')
svg.append(f'<path d="M0,600 C120,640 190,700 250,800 L0,800 Z" fill="{WATER}"/>')
svg.append(f'<circle cx="70" cy="200" r="9" fill="{PARK2}"/><circle cx="95" cy="330" r="12" fill="{PARK2}"/><circle cx="55" cy="470" r="10" fill="{PARK2}"/>')

# grid ------------------------------------------------------------------------
V=[(235,"25th"),(395,"24th"),(555,"23rd"),(715,"22nd"),(875,"21st"),(1025,"20th")]
H=[(130,"P St"),(270,"O St"),(405,"N St"),(545,"M St"),(665,"L St")]
for x,_ in V: svg.append(street_v(x,95,760, major=(x==555)))
for y,_ in H: svg.append(street_h(y,175,1120, major=(y==405)))

# diagonals: New Hampshire Ave (Washington Circle -> Dupont), Pennsylvania Ave
svg.append(avenue(470,715,985,140))            # New Hampshire Ave
svg.append(avenue(470,715,1010,800))           # Pennsylvania Ave (SE)

# traffic circles (green roundabouts) ----------------------------------------
def circle(cx,cy,r,label,ly):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r+8}" fill="{ST_FILL}" stroke="{ST_CASE}" stroke-width="3"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{PARK}"/>'
            f'<text x="{cx}" y="{cy+ly}" text-anchor="middle" font-size="17" fill="{HOOD}" font-weight="700" letter-spacing="1">{label}</text>')
svg.append(circle(985,140,26,"",0))
svg.append(circle(470,715,24,"",0))

# property block highlight + N-St frontage -----------------------------------
svg.append(f'<rect x="472" y="410" width="83" height="120" rx="4" fill="{GOLD}" opacity="0.18" stroke="{GOLDLINE}" stroke-width="1.5"/>')

# neighborhood labels ---------------------------------------------------------
def hood(x,y,t,size=25,anchor="middle",rot=0):
    tr=f' transform="rotate({rot} {x} {y})"' if rot else ""
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" fill="{HOOD}" font-weight="700" letter-spacing="3"{tr}>{t}</text>'
svg.append(hood(150,150,"GEORGETOWN",20,anchor="middle",rot=-64))
svg.append(hood(70,720,"POTOMAC RIVER",15,anchor="start",rot=-38))
svg.append(hood(1010,150,"DUPONT",18)); svg.append(hood(1010,172,"CIRCLE",18))
svg.append(hood(505,772,"FOGGY BOTTOM · GWU",17,anchor="middle"))
svg.append(hood(1095,430,"CBD",20,anchor="middle",rot=90))
svg.append(hood(760,320,"WEST END",22))

# street labels ---------------------------------------------------------------
for x,l in V: svg.append(f'<text x="{x+3}" y="108" font-size="12.5" fill="{STLBL}">{l}</text>')
for y,l in H: svg.append(f'<text x="1128" y="{y+4}" font-size="12.5" fill="{STLBL}">{l}</text>')
svg.append(f'<text x="770" y="235" font-size="12.5" fill="{STLBL}" transform="rotate(-48 770 235)">New Hampshire Ave</text>')
svg.append(f'<text x="760" y="700" font-size="12.5" fill="{STLBL}" transform="rotate(34 760 700)">Pennsylvania Ave</text>')

# metro markers ---------------------------------------------------------------
def metro(cx,cy,name,mins,dx,anchor="start"):
    s=(f'<g filter="url(#sh)"><circle cx="{cx}" cy="{cy}" r="16" fill="{METRO}"/></g>'
       f'<text x="{cx}" y="{cy+6}" text-anchor="middle" font-size="19" font-weight="800" fill="#fff" font-family="Georgia,serif">M</text>'
       f'<rect x="{cx-13}" y="{cy+17}" width="26" height="5" rx="2.5" fill="#0072CE"/>'
       f'<rect x="{cx-13}" y="{cy+17}" width="9" height="5" rx="2.5" fill="#F7941E"/>'
       f'<rect x="{cx+4}" y="{cy+17}" width="9" height="5" rx="2.5" fill="#A2A4A1"/>')
    lx = cx+dx
    s+=(f'<text x="{lx}" y="{cy-2}" text-anchor="{anchor}" font-size="14.5" font-weight="700" fill="{METRO}">{name}</text>'
        f'<text x="{lx}" y="{cy+15}" text-anchor="{anchor}" font-size="12.5" fill="{HOOD}">{mins}</text>')
    return s
svg.append(metro(548,738,"Foggy Bottom–GWU","9-min walk",24))
svg.append(metro(985,140,"Dupont Circle","13-min walk",-24,anchor="end"))

# luxury-hotel cluster on M St -----------------------------------------------
for hx in (415,475,635,700):
    svg.append(f'<circle cx="{hx}" cy="545" r="6" fill="#B9892E" stroke="#fff" stroke-width="1.5"/>')
svg.append(f'<rect x="360" y="565" width="360" height="26" rx="6" fill="#ffffff" stroke="{ST_CASE}" stroke-width="1"/>'
           f'<text x="372" y="583" font-size="12.5" fill="{INK}"><tspan font-weight="700">Hotels · </tspan>Ritz-Carlton · Park Hyatt · Fairmont · Westin</text>')

# subject pin -----------------------------------------------------------------
px,py=514,470
svg.append(f'<ellipse cx="{px}" cy="{py+3}" rx="15" ry="5" fill="#000" opacity="0.18"/>')
svg.append(f'<g filter="url(#sh)"><path d="M{px},{py+6} C{px-24},{py-28} {px-24},{py-64} {px},{py-64} C{px+24},{py-64} {px+24},{py-28} {px},{py+6} Z" fill="{GOLD}" stroke="#fff" stroke-width="4"/></g>')
svg.append(f'<circle cx="{px}" cy="{py-40}" r="10.5" fill="#fff"/><circle cx="{px}" cy="{py-40}" r="5" fill="{GOLDLINE}"/>')
lbl="2300 N Street, NW"; lw=len(lbl)*9.3+34
svg.append(f'<g filter="url(#sh)"><rect x="{px-lw/2}" y="{py+16}" width="{lw}" height="34" rx="8" fill="{INK}"/></g>'
           f'<text x="{px}" y="{py+38}" text-anchor="middle" font-size="17.5" font-weight="700" fill="#fff">{lbl}</text>')

# north arrow + legend --------------------------------------------------------
svg.append(f'<g transform="translate(1108,120)"><path d="M0,-26 L11,8 L0,0 L-11,8 Z" fill="{INK}"/>'
           f'<path d="M0,-26 L11,8 L0,0 Z" fill="#8a8a8a"/><text x="0" y="26" text-anchor="middle" font-size="15" font-weight="800" fill="{INK}">N</text></g>')

defs=(f'<defs><filter id="sh" x="-40%" y="-40%" width="180%" height="180%">'
      f'<feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.28"/></filter></defs>')

html=(f'<!doctype html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0}}'
      f'body{{width:{VBW}px;height:{VBH}px;overflow:hidden;'
      f'font-family:Arial,Helvetica,"Helvetica Neue",sans-serif}}</style></head>'
      f'<body><svg width="{VBW}" height="{VBH}" viewBox="0 0 {VBW} {VBH}" xmlns="http://www.w3.org/2000/svg">'
      f'{defs}{"".join(svg)}</svg></body></html>')

hp=os.path.join(tempfile.gettempdir(),"westend_map.html")
open(hp,"w").write(html)
out=os.path.join(HERE,"assets","location_map.png")
os.makedirs(os.path.dirname(out),exist_ok=True)
subprocess.run([CHROME,"--headless=new","--disable-gpu","--no-sandbox","--hide-scrollbars",
    "--force-device-scale-factor=2",f"--window-size={VBW},{VBH}",
    f"--screenshot={out}",f"file://{hp}"], check=True,
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print("wrote",out, os.path.getsize(out),"bytes")
