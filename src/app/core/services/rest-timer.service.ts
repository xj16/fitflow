import { computed, Injectable, signal } from '@angular/core';

/**
 * A countdown rest timer between sets.
 *
 * Kept in a service (not a component) so the countdown survives navigation —
 * the user can start a rest timer, browse their PRs, and the timer keeps
 * ticking. Uses a wall-clock deadline rather than decrementing a counter so it
 * stays accurate even if the interval callback is throttled in a backgrounded
 * WebView.
 */
@Injectable({ providedIn: 'root' })
export class RestTimerService {
  private handle: ReturnType<typeof setInterval> | null = null;
  private deadline = 0;
  private startedFrom = 0;

  private readonly _remainingMs = signal(0);
  private readonly _running = signal(false);

  /** Whole seconds remaining, never negative. */
  readonly remainingSec = computed(() =>
    Math.max(0, Math.ceil(this._remainingMs() / 1000)),
  );
  readonly running = this._running.asReadonly();

  /** 0..1 progress through the current rest period, for the ring animation. */
  readonly progress = computed(() => {
    if (this.startedFrom <= 0) {
      return 0;
    }
    const done = this.startedFrom - this._remainingMs();
    return Math.min(1, Math.max(0, done / this.startedFrom));
  });

  /** Formatted M:SS for display. */
  readonly display = computed(() => {
    const total = this.remainingSec();
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  });

  /** Start (or restart) a countdown of the given seconds. */
  start(seconds: number): void {
    this.stop();
    const ms = Math.max(0, Math.round(seconds * 1000));
    this.startedFrom = ms;
    this.deadline = Date.now() + ms;
    this._remainingMs.set(ms);
    this._running.set(true);
    this.handle = setInterval(() => this.tick(), 100);
  }

  /** Add (or subtract) seconds to a running timer. */
  adjust(deltaSeconds: number): void {
    if (!this._running()) {
      return;
    }
    this.deadline += deltaSeconds * 1000;
    this.startedFrom = Math.max(
      this.startedFrom + deltaSeconds * 1000,
      this.deadline - Date.now(),
    );
    this.tick();
  }

  stop(): void {
    if (this.handle !== null) {
      clearInterval(this.handle);
      this.handle = null;
    }
    this._running.set(false);
    this._remainingMs.set(0);
    this.startedFrom = 0;
  }

  private tick(): void {
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) {
      this._remainingMs.set(0);
      this.finish();
      return;
    }
    this._remainingMs.set(remaining);
  }

  private finish(): void {
    if (this.handle !== null) {
      clearInterval(this.handle);
      this.handle = null;
    }
    this._running.set(false);
    this.notifyDone();
  }

  /** Fire haptics + a short beep when the timer completes, best-effort. */
  private notifyDone(): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.([200, 100, 200]);
      }
    } catch {
      // Vibration API is best-effort; ignore failures.
    }
    this.beep();
  }

  private beep(): void {
    try {
      const Ctx =
        (globalThis as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) {
        return;
      }
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
      osc.onended = () => ctx.close();
    } catch {
      // Audio is best-effort; ignore autoplay / context errors.
    }
  }
}
