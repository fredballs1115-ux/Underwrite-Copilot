"""Render a PNG preview of how the Excel combo chart will look."""
import matplotlib.pyplot as plt
import numpy as np

NET_ABS_COLOR   = "#963634"
SF_DEL_COLOR    = "#C0504D"
RENT_LINE_COLOR = "#1F3864"

years = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
net_abs = [100437, -56411, -23948, 18759, 31836, 34656, -9390, 231444, -36955, 114004, -29494]
sf_del =  [0, 0, 0, 0, 0, 0, 0, 225124, 0, 110935, 0]
rent_growth = [5.64, 4.98, 5.76, 5.85, 6.50, 10.71, 11.40, 8.42, 6.03, 5.91, 5.91]

fig, ax1 = plt.subplots(figsize=(11, 5.5), dpi=140)
fig.patch.set_facecolor("white")
ax1.set_facecolor("white")

x = np.arange(len(years))
w = 0.38

b1 = ax1.bar(x - w/2, net_abs, width=w, color=NET_ABS_COLOR,
             edgecolor=NET_ABS_COLOR, label="Net Absorption")
b2 = ax1.bar(x + w/2, sf_del,  width=w, color=SF_DEL_COLOR,
             edgecolor=SF_DEL_COLOR, label="SF Delivered")

ax1.set_ylabel("Square Feet", color="#404040", fontsize=10)
ax1.set_xticks(x)
ax1.set_xticklabels(years, color="#404040", fontsize=9)
ax1.tick_params(axis="y", colors="#404040", labelsize=9)
ax1.axhline(0, color="#A6A6A6", linewidth=0.8)
ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:,.0f}"))
ax1.grid(axis="y", color="#D9D9D9", linewidth=0.6, zorder=0)
ax1.set_axisbelow(True)
for spine in ("top", "right"):
    ax1.spines[spine].set_visible(False)
for spine in ("left", "bottom"):
    ax1.spines[spine].set_color("#A6A6A6")

ax2 = ax1.twinx()
line, = ax2.plot(x, rent_growth, color=RENT_LINE_COLOR, linewidth=2.4,
                 marker="o", markersize=6, markerfacecolor=RENT_LINE_COLOR,
                 markeredgecolor=RENT_LINE_COLOR, label="Market Rent Growth")
ax2.set_ylabel("Market Rent Growth", color="#404040", fontsize=10)
ax2.tick_params(axis="y", colors="#404040", labelsize=9)
ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:.1f}%"))
for spine in ("top", "left"):
    ax2.spines[spine].set_visible(False)
ax2.spines["right"].set_color("#A6A6A6")

plt.title("Woodbridge - Absorption vs. Deliveries",
          fontsize=14, fontweight="bold", color="#000000", pad=14)

handles = [b1, b2, line]
labels = [h.get_label() for h in handles]
fig.legend(handles, labels, loc="lower center", ncol=3, frameon=False,
           bbox_to_anchor=(0.5, -0.02), fontsize=10)

plt.tight_layout(rect=[0, 0.04, 1, 1])
out = "/home/user/Underwrite-Copilot/scratchpad/Woodbridge_Chart_Preview.png"
plt.savefig(out, bbox_inches="tight", facecolor="white")
print(f"Saved: {out}")
