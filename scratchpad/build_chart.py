"""Build the Woodbridge industrial submarket combo chart per boss's style spec.

Style modeled on the Market vs. Vacancy chart Will Walters circulated:
  - maroon bars, dark navy line, white plot area, light gridlines
  - title on top, legend on bottom
  - bar values on one axis, percentages on the secondary axis
"""
from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.chart.marker import Marker
from openpyxl.drawing.line import LineProperties
from openpyxl.drawing.fill import ColorChoice
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

# ---- Palette (Office-style maroon + navy, matches Will's example) ----
NET_ABS_COLOR   = "963634"   # dark maroon (primary bar)
SF_DEL_COLOR    = "C0504D"   # lighter brick (secondary bar, harmonious w/ maroon)
RENT_LINE_COLOR = "1F3864"   # dark navy (line)
GRID_COLOR      = "D9D9D9"
AXIS_COLOR      = "595959"

wb = Workbook()
ws = wb.active
ws.title = "Woodbridge"

# ---- Data ----
headers = ["Year", "Net Absorption", "SF Delivered", "Market Rent Growth"]
rows = [
    (2016, 100437, None,    0.0564),
    (2017, -56411, None,    0.0498),
    (2018, -23948, None,    0.0576),
    (2019,  18759, None,    0.0585),
    (2020,  31836, None,    0.0650),
    (2021,  34656, None,    0.1071),
    (2022,  -9390, None,    0.1140),
    (2023, 231444, 225124,  0.0842),
    (2024, -36955, None,    0.0603),
    (2025, 114004, 110935,  0.0591),
    (2026, -29494, None,    0.0591),
]

# Title block
ws["A1"] = "Woodbridge - Absorption, Deliveries & Rent Growth"
ws["A1"].font = Font(name="Calibri", size=14, bold=True, color="000000")
ws.merge_cells("A1:D1")
ws["A1"].alignment = Alignment(horizontal="left", vertical="center")
ws.row_dimensions[1].height = 22

ws["A2"] = "Annual, 2016-2026  |  Source: CoStar (All Properties -> Industrial, >=20,000 SF)"
ws["A2"].font = Font(name="Calibri", size=9, italic=True, color="595959")
ws.merge_cells("A2:D2")

HEADER_ROW = 4
for col_idx, h in enumerate(headers, start=1):
    c = ws.cell(row=HEADER_ROW, column=col_idx, value=h)
    c.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    c.fill = PatternFill("solid", fgColor="1F3864")
    c.alignment = Alignment(horizontal="center", vertical="center")

thin = Side(style="thin", color="BFBFBF")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
for i, row in enumerate(rows, start=HEADER_ROW + 1):
    for j, val in enumerate(row, start=1):
        c = ws.cell(row=i, column=j, value=val)
        c.border = border
        c.font = Font(name="Calibri", size=11)
        if j == 1:
            c.alignment = Alignment(horizontal="center")
        elif j in (2, 3):
            c.number_format = '#,##0;[Red](#,##0);"-"'
            c.alignment = Alignment(horizontal="right")
        elif j == 4:
            c.number_format = "0.00%"
            c.alignment = Alignment(horizontal="right")

ws.column_dimensions["A"].width = 10
ws.column_dimensions["B"].width = 18
ws.column_dimensions["C"].width = 16
ws.column_dimensions["D"].width = 20

DATA_FIRST = HEADER_ROW + 1
DATA_LAST = HEADER_ROW + len(rows)

# ---- Bar chart: Net Absorption + SF Delivered ----
bar = BarChart()
bar.type = "col"
bar.style = 2
bar.grouping = "clustered"
bar.gapWidth = 80
bar.overlap = -10
bar.title = "Woodbridge - Absorption vs. Deliveries"
bar.y_axis.title = "Square Feet"
bar.x_axis.title = None

data_ref = Reference(ws, min_col=2, max_col=3, min_row=HEADER_ROW, max_row=DATA_LAST)
cats_ref = Reference(ws, min_col=1, min_row=DATA_FIRST, max_row=DATA_LAST)
bar.add_data(data_ref, titles_from_data=True)
bar.set_categories(cats_ref)

# Bar colors
bar.series[0].graphicalProperties = GraphicalProperties(solidFill=NET_ABS_COLOR)
bar.series[0].graphicalProperties.line = LineProperties(solidFill=NET_ABS_COLOR)
bar.series[1].graphicalProperties = GraphicalProperties(solidFill=SF_DEL_COLOR)
bar.series[1].graphicalProperties.line = LineProperties(solidFill=SF_DEL_COLOR)

# Primary axis: SF
bar.y_axis.number_format = '#,##0'
bar.y_axis.majorGridlines.spPr = GraphicalProperties(
    ln=LineProperties(solidFill=GRID_COLOR, w=6350)
)
bar.y_axis.txPr = None
bar.x_axis.majorGridlines = None

# ---- Line chart: Rent Growth on secondary axis ----
line = LineChart()
line_data = Reference(ws, min_col=4, min_row=HEADER_ROW, max_row=DATA_LAST)
line.add_data(line_data, titles_from_data=True)

# Secondary axis hookup
line.y_axis.axId = 200
line.y_axis.crosses = "max"
line.y_axis.number_format = "0.0%"
line.y_axis.title = "Market Rent Growth"
line.y_axis.majorGridlines = None

s = line.series[0]
s.graphicalProperties = GraphicalProperties(
    ln=LineProperties(solidFill=RENT_LINE_COLOR, w=28000)
)
s.smooth = False
s.marker = Marker(symbol="circle", size=6)
s.marker.graphicalProperties = GraphicalProperties(solidFill=RENT_LINE_COLOR)
s.marker.graphicalProperties.line = LineProperties(solidFill=RENT_LINE_COLOR)

bar += line

# Layout
bar.height = 11
bar.width = 22
bar.legend.position = "b"

ws.add_chart(bar, "F4")

# ---------------------------------------------------------------
# Second chart sheet: simulate the first deliverable layout too,
# but leave the rent/vacancy data table blank for now (boss hasn't
# sent that pull yet). Keeps the workbook ready when it arrives.
# ---------------------------------------------------------------

out = "/home/user/Underwrite-Copilot/scratchpad/Woodbridge_Industrial_Chart.xlsx"
wb.save(out)
print(f"Saved: {out}")
