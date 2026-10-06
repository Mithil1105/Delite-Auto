/**
 * Active engaged time — deliberately NOT "next page timestamp minus this page timestamp", which
 * badly overcounts a tab left open overnight. Time only accrues while the page is visible AND the
 * visitor is not idle.
 *
 * All classes are pure (the clock is injected) so they are unit-tested with mocked time — no real
 * waiting.
 */

export class EngagementTimer {
  private accumulatedMs = 0;
  private visibleSince: number | null = null;
  private readonly now: () => number;

  constructor(now: () => number, startActive: boolean) {
    this.now = now;
    if (startActive) this.visibleSince = now();
  }

  /** Call whenever the "engaged" state changes (visible && not idle). */
  setActive(active: boolean): void {
    const t = this.now();
    if (active && this.visibleSince === null) this.visibleSince = t;
    else if (!active && this.visibleSince !== null) {
      this.accumulatedMs += t - this.visibleSince;
      this.visibleSince = null;
    }
  }

  /** Total engaged seconds so far, rounded to 2dp and capped (a single page view never exceeds 4h). */
  seconds(): number {
    const live = this.visibleSince !== null ? this.now() - this.visibleSince : 0;
    return Math.min(14_400, Math.round(((this.accumulatedMs + live) / 1000) * 100) / 100);
  }

  get isActive(): boolean {
    return this.visibleSince !== null;
  }

  reset(active: boolean): void {
    this.accumulatedMs = 0;
    this.visibleSince = active ? this.now() : null;
  }
}

/**
 * Combines page visibility with inactivity. A visitor who stops interacting for `idleAfterMs`
 * (default 60 s) is idle until their next input; a hidden tab is never engaged.
 */
export class EngagementGate {
  private visible: boolean;
  private idle = false;
  private lastInput: number;
  private readonly now: () => number;
  private readonly idleAfterMs: number;

  constructor(now: () => number, startVisible: boolean, idleAfterMs = 60_000) {
    this.now = now;
    this.idleAfterMs = idleAfterMs;
    this.visible = startVisible;
    this.lastInput = now();
  }

  get engaged(): boolean {
    return this.visible && !this.idle;
  }

  setVisible(visible: boolean): boolean {
    this.visible = visible;
    if (visible) this.lastInput = this.now();
    return this.engaged;
  }

  /** Any real interaction (pointer, key, scroll, touch). */
  input(): boolean {
    this.lastInput = this.now();
    this.idle = false;
    return this.engaged;
  }

  /** Periodic check; returns the (possibly changed) engaged state. */
  tick(): boolean {
    if (!this.idle && this.now() - this.lastInput >= this.idleAfterMs) this.idle = true;
    return this.engaged;
  }
}

/** Maximum scroll depth reached, as a whole percentage (0-100). */
export class ScrollDepth {
  private max = 0;

  update(scrollY: number, viewportHeight: number, documentHeight: number): void {
    const scrollable = documentHeight - viewportHeight;
    // A page that fits in the viewport has been "fully seen".
    const pct = scrollable <= 0 ? 100 : Math.round((scrollY / scrollable) * 100);
    this.max = Math.max(this.max, Math.min(100, Math.max(0, pct)));
  }

  percent(): number {
    return this.max;
  }

  reset(): void {
    this.max = 0;
  }
}
