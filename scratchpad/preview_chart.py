"""PNG previews of the two Woodbridge industrial charts."""
import matplotlib.pyplot as plt
import numpy as np

NET_ABS_COLOR   = "#963634"
SF_DEL_COLOR    = "#C0504D"
LINE_COLOR      = "#1F3864"

DATA = [
    (2016,  9.67, 0.02204,  100437, 0,       0.0564),
    (2017, 10.15, 0.04520,  -56411, 0,       0.0498),
    (2018, 10.74, 0.05503,  -23948, 0,       0.0576),
    (2019, 11.37, 0.04733,   18759, 0,       0.0585),
    (2020, 12.11, 0.03426,   31836, 0,       0.0650),
    (2021, 13.40, 0.02003,   34656, 0,       0.1071),
    (2022, 14.93, 0.02389,   -9390, 0,       0.1140),
    (2023, 16.19, 0.01949,  231444, 225124,  0.0842),
    (2024, 17.16, 0.03338,  -36955, 0,       0.0603),
    (2025, 18.17, 0.03094,  114004, 110935,  0.0591),
    (2026, 18.65, 0.04158,  -29494, 0,       0.0591),
]
years = [r[0] for r in DATA]
rent  = [r[1] for r in DATA]
vac   = [r[2]*100 for r in DATA]
na    = [r[3] for r in DATA]
deliv = [r[4] for r in DATA]
g     = [r[5]*100 for r in DATA]

def style_axes(ax):
    ax.tick_params(colors="#404040", labelsize=9)
    ax.grid(axis="y", color="#D9D9D9", linewidth=0.6, zorder=0)
    ax.set_axisbelow(True)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_color("#A6A6A6")

# -------- Chart 1: Market vs Vacancy --------
fig, ax1 = plt.subplots(figsize=(11, 5.5), dpi=140)
fig.patch.set_facecolor("white"); ax1.set_facecolor("white")
x = np.arange(len(years))
b = ax1.bar(x, rent, width=0.6, color=NET_ABS_COLOR, edgecolor=NET_ABS_COLOR,
            label="Market Rent")
ax1.set_ylabel("Market Rent ($/SF)", color="#404040", fontsize=10)
ax1.set_xticks(x); ax1.set_xticklabels(years, color="#404040", fontsize=9)
ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"${v:,.2f}"))
style_axes(ax1)
ax2 = ax1.twinx()
ln, = ax2.plot(x, vac, color=LINE_COLOR, linewidth=2.4, marker="o", markersize=6,
               markerfacecolor=LINE_COLOR, markeredgecolor=LINE_COLOR,
               label="Vacancy Rate")
ax2.set_ylabel("Vacancy Rate", color="#404040", fontsize=10)
ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:.1f}%"))
for spine in ("top", "left"): ax2.spines[spine].set_visible(False)
ax2.spines["right"].set_color("#A6A6A6"); ax2.tick_params(colors="#404040", labelsize=9)
plt.title("Woodbridge Industrial - Market vs. Vacancy",
          fontsize=14, fontweight="bold", color="#000000", pad=14)
fig.legend([b, ln], ["Market Rent", "Vacancy Rate"], loc="lower center",
           ncol=2, frameon=False, bbox_to_anchor=(0.5, -0.02), fontsize=10)
plt.tight_layout(rect=[0, 0.04, 1, 1])
out1 = "/home/user/Underwrite-Copilot/scratchpad/Woodbridge_Market_vs_Vacancy_Preview.png"
plt.savefig(out1, bbox_inches="tight", facecolor="white")
plt.close()

# -------- Chart 2: Absorption vs Deliveries --------
fig, ax1 = plt.subplots(figsize=(11, 5.5), dpi=140)
fig.patch.set_facecolor("white"); ax1.set_facecolor("white")
w = 0.38
b1 = ax1.bar(x - w/2, na,    width=w, color=NET_ABS_COLOR, edgecolor=NET_ABS_COLOR,
             label="Net Absorption")
b2 = ax1.bar(x + w/2, deliv, width=w, color=SF_DEL_COLOR,  edgecolor=SF_DEL_COLOR,
             label="SF Delivered")
ax1.set_ylabel("Square Feet", color="#404040", fontsize=10)
ax1.set_xticks(x); ax1.set_xticklabels(years, color="#404040", fontsize=9)
ax1.axhline(0, color="#A6A6A6", linewidth=0.8)
ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:,.0f}"))
style_axes(ax1)
ax2 = ax1.twinx()
ln, = ax2.plot(x, g, color=LINE_COLOR, linewidth=2.4, marker="o", markersize=6,
               markerfacecolor=LINE_COLOR, markeredgecolor=LINE_COLOR,
               label="Market Rent Growth")
ax2.set_ylabel("Market Rent Growth", color="#404040", fontsize=10)
ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:.1f}%"))
for spine in ("top", "left"): ax2.spines[spine].set_visible(False)
ax2.spines["right"].set_color("#A6A6A6"); ax2.tick_params(colors="#404040", labelsize=9)
plt.title("Woodbridge Industrial - Absorption vs. Deliveries",
          fontsize=14, fontweight="bold", color="#000000", pad=14)
fig.legend([b1, b2, ln], ["Net Absorption", "SF Delivered", "Market Rent Growth"],
           loc="lower center", ncol=3, frameon=False,
           bbox_to_anchor=(0.5, -0.02), fontsize=10)
plt.tight_layout(rect=[0, 0.04, 1, 1])
out2 = "/home/user/Underwrite-Copilot/scratchpad/Woodbridge_Chart_Preview.png"
plt.savefig(out2, bbox_inches="tight", facecolor="white")
plt.close()

print(f"Saved: {out1}")
print(f"Saved: {out2}")
