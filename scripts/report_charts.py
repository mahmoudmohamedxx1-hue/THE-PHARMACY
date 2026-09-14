#!/usr/bin/env python3
"""Charts for The Pharmacy QA Audit & Strategy report.
Template 07 Crystal Blue palette family. English labels (user language).
Rules: no top/right spines, dashed grid 20%, direct value labels, no legend boxes.
"""
import matplotlib
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# Template 07 Crystal Blue family
ACCENT = '#2d7ab3'
DEEP = '#1a4a7a'
LIGHT = '#c0d0e2'
MUTED = '#5a7a96'
TEXT = '#142840'
BG = '#ffffff'

OUT = '/home/z/my-project/scripts/report-assets'
import os
os.makedirs(OUT, exist_ok=True)

def style_ax(ax):
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color(LIGHT)
    ax.spines['bottom'].set_color(LIGHT)
    ax.tick_params(colors=MUTED, labelsize=11)
    ax.grid(True, axis='x', linestyle='--', alpha=0.2, linewidth=0.5)
    ax.set_axisbelow(True)

# ============ CHART 1: QA test suite results ============
suites = ['API functional', 'SEO / PWA', 'Data integrity', 'Security', 'E2E user flows', 'Cross-runtime']
counts = [60, 23, 24, 14, 11, 3]

fig, ax = plt.subplots(figsize=(9, 4.6), constrained_layout=True)
bars = ax.barh(suites[::-1], counts[::-1], color=ACCENT, height=0.62, edgecolor='none', zorder=3)
bars[-1].set_color(DEEP)  # highlight the largest suite
style_ax(ax)
for bar, c in zip(bars, counts[::-1]):
    ax.text(bar.get_width() + 0.8, bar.get_y() + bar.get_height() / 2, f'{c}/{c}  passed',
            va='center', ha='left', fontsize=11.5, color=TEXT, fontweight='bold')
ax.set_xlim(0, 72)
ax.set_xlabel('Automated checks executed (all passing)', fontsize=11, color=MUTED)
ax.set_xticks([0, 20, 40, 60])
fig.savefig(f'{OUT}/chart_qa.png', dpi=220, facecolor=BG)
plt.close(fig)

# ============ CHART 2: Performance transformation ============
stages = ['Dev mode\n(before)', 'Production\n(raw)', 'Production\n(gzipped)']
sizes = [5517, 909, 290]
colors = [MUTED, ACCENT, DEEP]

fig, ax = plt.subplots(figsize=(8.6, 4.6), constrained_layout=True)
bars = ax.bar(stages, sizes, color=colors, width=0.52, edgecolor='none', zorder=3)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color(LIGHT)
ax.spines['bottom'].set_color(LIGHT)
ax.tick_params(colors=MUTED, labelsize=11.5)
ax.grid(True, axis='y', linestyle='--', alpha=0.2, linewidth=0.5)
ax.set_axisbelow(True)
for bar, s in zip(bars, sizes):
    ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 110,
            f'{s:,} KB', ha='center', fontsize=13, color=TEXT, fontweight='bold')
ax.annotate('-95%', xy=(1.5, 3000), fontsize=15, color=DEEP, fontweight='bold', ha='center')
ax.set_ylim(0, 6300)
ax.set_ylabel('JavaScript shipped to browser (KB)', fontsize=11, color=MUTED)
fig.savefig(f'{OUT}/chart_perf.png', dpi=220, facecolor=BG)
plt.close(fig)

# ============ CHART 3: Egypt e-pharmacy market ============
years = [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032]
vals = [69, 82, 98, 117, 140, 167, 199, 236]  # 19.2% CAGR interpolation

fig, ax = plt.subplots(figsize=(8.6, 4.4), constrained_layout=True)
ax.plot(years, vals, color=ACCENT, linewidth=2.6, solid_capstyle='round', zorder=4)
ax.fill_between(years, vals, color=ACCENT, alpha=0.12, zorder=2)
ax.scatter([years[0], years[-1]], [vals[0], vals[-1]], s=42, color=DEEP, zorder=5)
ax.annotate('$69M', xy=(2025, 69), xytext=(2025.05, 92), fontsize=13, color=TEXT, fontweight='bold')
ax.annotate('$236M', xy=(2032, 236), xytext=(2031.1, 250), fontsize=13, color=TEXT, fontweight='bold')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color(LIGHT)
ax.spines['bottom'].set_color(LIGHT)
ax.tick_params(colors=MUTED, labelsize=11)
ax.grid(True, axis='y', linestyle='--', alpha=0.2, linewidth=0.5)
ax.set_axisbelow(True)
ax.set_ylim(0, 285)
ax.set_xticks(years)
ax.set_ylabel('Market size (USD millions)', fontsize=11, color=MUTED)
ax.text(2025.1, 258, 'Egypt e-pharmacy market, 19.2% CAGR (Ken Research)', fontsize=10.5, color=MUTED)
fig.savefig(f'{OUT}/chart_market.png', dpi=220, facecolor=BG)
plt.close(fig)

# ============ CHART 4: Competitor funding ============
players = ['Vezeeta', 'Yodawy', 'Chefaa', 'The Pharmacy\n(this project)']
funding = [60, 35, 10, 0]

fig, ax = plt.subplots(figsize=(9, 4.4), constrained_layout=True)
bars = ax.barh(players[::-1], funding[::-1], color=[ACCENT, ACCENT, ACCENT, DEEP][::-1], height=0.6, edgecolor='none', zorder=3)
style_ax(ax)
labels = ['$60M+', '$35M', '~$10M', '$0 (bootstrapped)']
for bar, lab in zip(bars, labels[::-1]):
    x = bar.get_width() + 1 if bar.get_width() > 0 else 1.2
    ha = 'left'
    ax.text(x, bar.get_y() + bar.get_height() / 2, lab, va='center', ha=ha,
            fontsize=11.5, color=TEXT, fontweight='bold')
ax.set_xlim(0, 74)
ax.set_xlabel('Total equity funding raised (USD millions, public reports)', fontsize=11, color=MUTED)
ax.set_xticks([0, 20, 40, 60])
fig.savefig(f'{OUT}/chart_funding.png', dpi=220, facecolor=BG)
plt.close(fig)

print("4 charts saved to", OUT)
for f in sorted(os.listdir(OUT)):
    print(" -", f, f"{os.path.getsize(os.path.join(OUT, f))//1024} KB")
