#!/usr/bin/env python3
"""Generate a clean schematic locator map for 2300 N Street, NW (West End, DC).
Writes assets/location_map.png at the exact aspect used on the Location slide."""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1400, 962                      # 5.75 x 3.95 in aspect
BG      = (247, 246, 243)
STREET  = (214, 211, 205)
STREETLBL = (150, 147, 141)
PARK    = (223, 232, 219)
WATER   = (206, 224, 233)
HOOD    = (168, 164, 156)
GOLD    = (245, 180, 0)
DARK    = (38, 38, 38)
METRO   = (34, 34, 34)

def font(sz, bold=False):
    for name in ([ "DejaVuSans-Bold.ttf"] if bold else ["DejaVuSans.ttf"]):
        for p in ("/usr/share/fonts/truetype/dejavu/"+name, name):
            try: return ImageFont.truetype(p, sz)
            except Exception: pass
    return ImageFont.load_default()

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# --- Rock Creek / Georgetown green edge (upper-left) + Potomac (lower-left) ---
d.polygon([(0,0),(210,0),(150,330),(0,430)], fill=PARK)
d.polygon([(0,560),(150,520),(300,760),(300,962),(0,962)], fill=WATER)
d.text((36,markY:=250), "ROCK CREEK\nPARK", font=font(20, True), fill=HOOD)
d.text((70,840), "POTOMAC\nRIVER", font=font(20, True), fill=(120,150,165))

# --- street grid (schematic) ---
verticals = [(300,"25th"),(470,"24th"),(640,"23rd"),(810,"22nd"),(980,"21st"),(1150,"20th")]
horizont  = [(150,"P St"),(300,"O St"),(470,"N St"),(650,"M St"),(830,"Penn Ave")]
for x,lbl in verticals:
    d.line([(x,60),(x,900)], fill=STREET, width=10)
    d.text((x-16,20), lbl, font=font(17), fill=STREETLBL)
for y,lbl in horizont:
    d.line([(250,y),(1330,y)], fill=STREET, width=10)
    d.text((1230,y-24), lbl, font=font(17), fill=STREETLBL)

# --- neighborhood labels ---
d.text((330,120), "DUPONT CIRCLE", font=font(22, True), fill=HOOD)
d.text((250,700), "FOGGY BOTTOM", font=font(22, True), fill=HOOD)
d.text((1040,150), "CBD /\nDOWNTOWN", font=font(22, True), fill=HOOD)
d.text((150,560), "GEORGETOWN", font=font(22, True), fill=HOOD)
d.text((360,360), "WEST END", font=font(24, True), fill=(120,110,95))

# --- Metro markers ---
def metro(x,y,label):
    r=17
    d.ellipse([x-r,y-r,x+r,y+r], fill=METRO)
    d.text((x-9,y-13), "M", font=font(22, True), fill=(255,255,255))
    d.text((x+24,y-11), label, font=font(15, True), fill=METRO)
metro(300,470,"Foggy Bottom-GWU")
metro(470,150,"Dupont Circle")

# --- subject pin at 23rd & N ---
px,py = 640,470
# leader shadow
d.ellipse([px-13,py+30,px+13,py+42], fill=(180,170,150))
# pin body (teardrop via circle + triangle)
d.polygon([(px-26,py-8),(px+26,py-8),(px,py+40)], fill=GOLD)
d.ellipse([px-30,py-58,px+30,py+2], fill=GOLD, outline=(255,255,255), width=6)
d.ellipse([px-11,py-38,px+11,py-16], fill=(255,255,255))
# label plate
lbl="2300 N Street, NW"
f=font(26, True); tb=d.textbbox((0,0),lbl,font=f); tw=tb[2]-tb[0]
lx,ly = px-tw//2-16, py+58
d.rounded_rectangle([lx,ly,lx+tw+32,ly+52], radius=10, fill=DARK)
d.text((lx+16,ly+13), lbl, font=f, fill=(255,255,255))

# --- north arrow ---
ax,ay=1300,110
d.polygon([(ax,ay-34),(ax-14,ay+6),(ax+14,ay+6)], fill=DARK)
d.polygon([(ax,ay-34),(ax,ay+6),(ax+14,ay+6)], fill=(120,120,120))
d.text((ax-8,ay+12), "N", font=font(20, True), fill=DARK)

os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets"), exist_ok=True)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "location_map.png")
img.save(out)
print("wrote", out)
