import { RestTimerService } from './rest-timer.service';

describe('RestTimerService', () => {
  let timer: RestTimerService;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 0, 1, 12, 0, 0));
    timer = new RestTimerService();
  });

  afterEach(() => {
    timer.stop();
    jasmine.clock().uninstall();
  });

  it('starts a countdown and reports remaining seconds', () => {
    timer.start(90);
    expect(timer.running()).toBeTrue();
    expect(timer.remainingSec()).toBe(90);
  });

  it('counts down as time passes', () => {
    timer.start(60);
    jasmine.clock().tick(10_000); // 10s
    expect(timer.remainingSec()).toBeLessThanOrEqual(50);
    expect(timer.remainingSec()).toBeGreaterThanOrEqual(49);
  });

  it('reports progress between 0 and 1', () => {
    timer.start(100);
    expect(timer.progress()).toBeCloseTo(0, 2);
    jasmine.clock().tick(50_000);
    expect(timer.progress()).toBeGreaterThan(0.45);
    expect(timer.progress()).toBeLessThan(0.55);
  });

  it('stops and resets when finished', () => {
    timer.start(5);
    jasmine.clock().tick(6_000);
    expect(timer.running()).toBeFalse();
    expect(timer.remainingSec()).toBe(0);
  });

  it('adds time to a running timer', () => {
    timer.start(30);
    timer.adjust(15);
    expect(timer.remainingSec()).toBeGreaterThanOrEqual(44);
  });

  it('formats the display as M:SS', () => {
    timer.start(75);
    expect(timer.display()).toBe('1:15');
  });
});
