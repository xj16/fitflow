import { TestBed, ComponentFixture } from '@angular/core/testing';
import { MiniChartComponent, ChartPoint } from './mini-chart.component';

describe('MiniChartComponent', () => {
  let fixture: ComponentFixture<MiniChartComponent>;
  let component: MiniChartComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MiniChartComponent] });
    fixture = TestBed.createComponent(MiniChartComponent);
    component = fixture.componentInstance;
  });

  function setPoints(points: ChartPoint[], type: 'line' | 'bar' = 'line'): void {
    fixture.componentRef.setInput('points', points);
    fixture.componentRef.setInput('type', type);
    fixture.detectChanges();
  }

  it('reports no data for an empty series', () => {
    setPoints([]);
    expect(component.hasData()).toBeFalse();
    expect(component.coords()).toEqual([]);
    expect(component.linePath()).toBe('');
  });

  it('maps a single point to the horizontal center', () => {
    setPoints([{ label: 'A', value: 50 }]);
    const c = component.coords();
    expect(c.length).toBe(1);
    // width 300, padX 8 → usable 284, center = 8 + 142 = 150.
    expect(c[0].x).toBeCloseTo(150, 0);
  });

  it('spreads multiple points evenly across the usable width', () => {
    setPoints([
      { label: 'A', value: 10 },
      { label: 'B', value: 20 },
      { label: 'C', value: 30 },
    ]);
    const c = component.coords();
    expect(c[0].x).toBeCloseTo(8, 1); // left edge (padX)
    expect(c[2].x).toBeCloseTo(292, 1); // right edge (width - padX)
    // Highest value sits at the top (smallest y), lowest at the bottom.
    expect(c[2].y).toBeLessThan(c[0].y);
  });

  it('builds a polyline string with one coord pair per point', () => {
    setPoints([
      { label: 'A', value: 1 },
      { label: 'B', value: 2 },
    ]);
    expect(component.linePath().split(' ').length).toBe(2);
  });

  it('produces a closed area path for the line variant', () => {
    setPoints([
      { label: 'A', value: 1 },
      { label: 'B', value: 3 },
    ]);
    const d = component.areaPath();
    expect(d.startsWith('M')).toBeTrue();
    expect(d.trim().endsWith('Z')).toBeTrue();
  });

  it('computes non-negative bar rectangles for the bar variant', () => {
    setPoints(
      [
        { label: 'A', value: 100 },
        { label: 'B', value: 200 },
      ],
      'bar',
    );
    const bars = component.bars();
    expect(bars.length).toBe(2);
    for (const b of bars) {
      expect(b.w).toBeGreaterThan(0);
      expect(b.h).toBeGreaterThanOrEqual(1);
    }
  });

  it('exposes the latest value', () => {
    setPoints([
      { label: 'A', value: 10 },
      { label: 'B', value: 42 },
    ]);
    expect(component.latest()).toBe(42);
  });

  it('activates a point for the tooltip and clamps its x anchor', () => {
    setPoints([
      { label: 'Jan 1', value: 10 },
      { label: 'Jan 8', value: 20 },
    ]);
    component.setActive(1);
    const active = component.activeCoord();
    expect(active?.label).toBe('Jan 8');
    expect(active?.value).toBe(20);
    // Tooltip x stays within the chart (0..width-60).
    expect(component.tooltipX()).toBeGreaterThanOrEqual(4);
    expect(component.tooltipX()).toBeLessThanOrEqual(240);

    component.setActive(null);
    expect(component.activeCoord()).toBeNull();
  });
});
