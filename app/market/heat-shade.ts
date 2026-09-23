/**
 * One shade for every board on the market page: emerald at 0 (the best
 * position in a column — the tightest vacancy, the fastest payroll growth)
 * to amber at 1, at a low alpha so the figure on top stays readable. Pure,
 * so a render test can compare two cells' backgrounds.
 */
export function heatShade(t: number): string {
  const c = [
    Math.round(16 + (217 - 16) * t),
    Math.round(185 + (119 - 185) * t),
    Math.round(129 + (6 - 129) * t),
  ];
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(0.1 + 0.14 * (1 - Math.abs(0.5 - t) * 2) + 0.08 * t).toFixed(3)})`;
}
