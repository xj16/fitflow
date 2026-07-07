import { Component, computed, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface ChartPoint {
  /** X label, e.g. a short date. */
  label: string;
  value: number;
}

/** A resolved on-screen point plus its source datum, for tooltips. */
export interface ChartCoord {
  x: number;
  y: number;
  value: number;
  label: string;
}

/**
 * A tiny, dependency-free SVG chart.
 *
 * Deliberately avoids Chart.js / d3 so the bundle stays small and the app has
 * zero runtime chart dependencies. Renders either a line (for 1RM/strength
 * progression) or bars (for per-session volume). All geometry is computed with
 * pure signals, and the viewBox scales responsively to its container.
 */
@Component({
  selector: 'app-mini-chart',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './mini-chart.component.html',
  styleUrl: './mini-chart.component.scss',
})
export class MiniChartComponent {
  readonly points = input<ChartPoint[]>([]);
  readonly type = input<'line' | 'bar'>('line');
  readonly color = input<string>('#5b6cff');
  readonly unit = input<string>('');

  private readonly width = 300;
  private readonly height = 120;
  private readonly padX = 8;
  private readonly padY = 12;

  readonly viewBox = `0 0 ${this.width} ${this.height}`;

  private readonly maxValue = computed(() => {
    const vals = this.points().map((p) => p.value);
    return vals.length ? Math.max(...vals) : 0;
  });

  private readonly minValue = computed(() => {
    const vals = this.points().map((p) => p.value);
    return vals.length ? Math.min(...vals) : 0;
  });

  readonly width_ = this.width;
  readonly height_ = this.height;

  /** Index of the point the user is hovering / has tapped, or null. */
  readonly activeIndex = signal<number | null>(null);

  /** The currently highlighted coordinate for the tooltip, if any. */
  readonly activeCoord = computed<ChartCoord | null>(() => {
    const i = this.activeIndex();
    const cs = this.coords();
    return i !== null && i >= 0 && i < cs.length ? cs[i] : null;
  });

  /** Horizontal anchor for the tooltip, clamped so it stays in view. */
  readonly tooltipX = computed(() => {
    const c = this.activeCoord();
    if (!c) {
      return 0;
    }
    return Math.min(this.width - 60, Math.max(4, c.x - 30));
  });

  setActive(i: number | null): void {
    this.activeIndex.set(i);
  }

  /** Half-width of each point's invisible hover/tap hit target. */
  readonly hitHalf = computed(() => {
    const n = this.points().length;
    if (n <= 1) {
      return (this.width - this.padX * 2) / 2;
    }
    return (this.width - this.padX * 2) / (n - 1) / 2;
  });

  /** Screen coordinates for each data point. */
  readonly coords = computed<ChartCoord[]>(() => {
    const pts = this.points();
    if (pts.length === 0) {
      return [];
    }
    const max = this.maxValue();
    const min = Math.min(this.minValue(), max * 0.9);
    const range = max - min || 1;
    const usableW = this.width - this.padX * 2;
    const usableH = this.height - this.padY * 2;
    const step = pts.length > 1 ? usableW / (pts.length - 1) : 0;

    return pts.map((p, i) => {
      const x = this.padX + (pts.length > 1 ? step * i : usableW / 2);
      const norm = (p.value - min) / range;
      const y = this.padY + usableH - norm * usableH;
      return { x, y, value: p.value, label: p.label };
    });
  });

  /** Polyline points string for the line variant. */
  readonly linePath = computed(() =>
    this.coords()
      .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' '),
  );

  /** Filled area path under the line for a subtle gradient fill. */
  readonly areaPath = computed(() => {
    const c = this.coords();
    if (c.length === 0) {
      return '';
    }
    const baseline = this.height - this.padY;
    const first = c[0];
    const last = c[c.length - 1];
    const line = c.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return `M ${first.x.toFixed(1)} ${baseline} ${line} L ${last.x.toFixed(1)} ${baseline} Z`;
  });

  /** Bar rectangles for the bar variant. */
  readonly bars = computed(() => {
    const c = this.coords();
    if (c.length === 0) {
      return [] as Array<{ x: number; y: number; w: number; h: number }>;
    }
    const usableW = this.width - this.padX * 2;
    const barW = Math.max(3, (usableW / c.length) * 0.6);
    const baseline = this.height - this.padY;
    return c.map((p) => ({
      x: p.x - barW / 2,
      y: p.y,
      w: barW,
      h: Math.max(1, baseline - p.y),
    }));
  });

  readonly latest = computed(() => {
    const pts = this.points();
    return pts.length ? pts[pts.length - 1].value : 0;
  });

  readonly hasData = computed(() => this.points().length > 0);
}
