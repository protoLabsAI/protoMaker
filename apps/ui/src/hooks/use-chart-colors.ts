/**
 * useChartColors — Resolves CSS custom properties to sRGB hex for SVG use.
 *
 * Chrome's SVG engine doesn't support oklch() in presentation attributes
 * (fill, stroke, etc.). Since our design tokens use oklch, we resolve them
 * to hex via Canvas 2D context before passing to Recharts.
 *
 * CSS inline styles (e.g., Tooltip contentStyle) DO support oklch and
 * can use var(--token) directly — this hook is only needed for SVG attributes.
 */
import { useEffect, useState } from 'react';

function resolveToHex(oklchValue: string): string {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return '#888888';
  ctx.fillStyle = '#000000'; // Reset
  ctx.fillStyle = oklchValue;
  return ctx.fillStyle;
}

function resolveCSSVar(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? resolveToHex(raw) : '#888888';
}

function buildColors() {
  return {
    primary: resolveCSSVar('--primary'),
    border: resolveCSSVar('--border'),
    card: resolveCSSVar('--card'),
    muted: resolveCSSVar('--muted'),
    mutedForeground: resolveCSSVar('--muted-foreground'),
    destructive: resolveCSSVar('--destructive'),
    chart1: resolveCSSVar('--chart-1'),
    chart2: resolveCSSVar('--chart-2'),
    chart3: resolveCSSVar('--chart-3'),
    chart4: resolveCSSVar('--chart-4'),
    chart5: resolveCSSVar('--chart-5'),
  };
}

export type ChartColors = ReturnType<typeof buildColors>;

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState(buildColors);

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(buildColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return colors;
}
