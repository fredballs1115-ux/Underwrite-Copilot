"""Build the Woodbridge industrial submarket combo chart per boss spec."""
from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.layout import Layout, ManualLayout
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.chart.text import RichText
from openpyxl.drawing.text import (
    Paragraph,
    ParagraphProperties,
    CharacterProperties,
    RichTextProperties,
    RegularTextRun,
)
from openpyxl.drawing.fill import ColorChoice
from openpyxl.drawing.line import LineProperties
from openpyxl.chart.marker import Marker
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = "Woodbridge"

# ---- Data ----
headers = ["Year", "Net Absorption", "SF Delivered", "Market Rent Growth"]
rows = [
    (2016, 100437, None, 0.0564),
    (2017, -56411, None, 0.0498),
    (2018, -23948, None, 0.0576),
    (2019,  18759, None, 0.0585),
    (2020,  31836, None, 0.0650),
    (2021,  34656, None, 0.1071),
    (2022,  -9390, None, 0.1140),
    (2023, 231444, 225124, 0.0842),
    (2024, -36955, None, 0.0603),
    (2025, 114004, 110935, 0.0591),
    (2026, -29494, None, 0.0591),
]

# Title row
ws["A1"] = "Woodbridge Industrial Submarket — Net Absorption, Deliveries & Rent Growth"
ws["A1"].font = Font(name="Calibri", size=14, bold=True, color="1F3864")
ws.merge_cells("A1:D1")
ws["A1"].alignment = Alignment(horizontal="left", vertical="center")
ws.row_dimensions[1].height = 22

ws["A2"] = "Annual, 2016–2026  |  Source: CoStar (All Properties → Industrial, ≥20,000 SF)"
ws["A2"].font = Font(name="Calibri", size=9, italic=True, color="595959")
ws.merge_cells("A2:D2")

# Header row
HEADER_ROW = 4
for col_idx, h in enumerate(headers, start=1):
    c = ws.cell(row=HEADER_ROW, column=col_idx, value=h)
    c.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    c.fill = PatternFill("solid", fgColor="1F3864")
    c.alignment = Alignment(horizontal="center", vertical="center")

# Data rows
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
            c.number_format = '#,##0;[Red](#,##0);"—"'
            c.alignment = Alignment(horizontal="right")
        elif j == 4:
            c.number_format = "0.00%"
            c.alignment = Alignment(horizontal="right")

# Column widths
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
bar.gapWidth = 90
bar.title = "Woodbridge Industrial — Net Absorption & SF Delivered with Market Rent Growth"
bar.y_axis.title = "SF"
bar.x_axis.title = "Year"

data_ref = Reference(ws, min_col=2, max_col=3, min_row=HEADER_ROW, max_row=DATA_LAST)
cats_ref = Reference(ws, min_col=1, min_row=DATA_FIRST, max_row=DATA_LAST)
bar.add_data(data_ref, titles_from_data=True)
bar.set_categories(cats_ref)

# Colors for the two bar series (Excel-style blue + orange)
NET_ABS_COLOR = "4472C4"
SF_DEL_COLOR = "ED7D31"
RENT_GROWTH_COLOR = "A5A5A5"

bar.series[0].graphicalProperties = GraphicalProperties(solidFill=NET_ABS_COLOR)
bar.series[1].graphicalProperties = GraphicalProperties(solidFill=SF_DEL_COLOR)

# Number formats on the SF axis
bar.y_axis.number_format = '#,##0'
bar.y_axis.majorGridlines.spPr = GraphicalProperties(
    ln=LineProperties(solidFill="D9D9D9")
)

# ---- Line chart: Market Rent Growth on secondary axis ----
line = LineChart()
line_data = Reference(ws, min_col=4, min_row=HEADER_ROW, max_row=DATA_LAST)
line.add_data(line_data, titles_from_data=True)

# Secondary axis hookup
line.y_axis.axId = 200
line.y_axis.crosses = "max"
line.y_axis.number_format = "0.0%"
line.y_axis.title = "Market Rent Growth (%)"

# Style the line series
line_series = line.series[0]
line_series.graphicalProperties = GraphicalProperties(
    ln=LineProperties(solidFill=RENT_GROWTH_COLOR, w=28000)
)
line_series.smooth = False
line_series.marker = Marker(symbol="circle", size=7)
line_series.marker.graphicalProperties = GraphicalProperties(solidFill=RENT_GROWTH_COLOR)
line_series.marker.graphicalProperties.line = LineProperties(solidFill=RENT_GROWTH_COLOR)

# Combine
bar += line

# Layout / size
bar.height = 11
bar.width = 22
bar.legend.position = "b"

# Add chart to sheet
ws.add_chart(bar, "F4")

out = "/home/user/Underwrite-Copilot/scratchpad/Woodbridge_Industrial_Chart.xlsx"
wb.save(out)
print(f"Saved: {out}")
