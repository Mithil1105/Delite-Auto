import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { EngagementGate, EngagementTimer, ScrollDepth } from "./engagement";
import { currentPageViewId, flushAnalytics, initAnalytics, reportEngagement, startPageView } from "./client";
import { pageInfo } from "./pathing";

/** Cumulative engagement is re-reported this often while the page stays open, so a tab that is
 * killed without a clean pagehide (common on mobile) still has almost all its time recorded. */
const HEARTBEAT_MS = 30_000;
const IDLE_CHECK_MS = 10_000;

/**
 * Emits one page view per SPA route change (pathname; plus the *listing identity* on /shop — a
 * different category/brand/search is a different page view, pagination/sort is not) and measures
 * active engaged time + max scroll depth for it.
 *
 * Engaged time accrues only while the tab is visible AND the visitor isn't idle (60 s without
 * input) — see engagement.ts. It is flushed on route change, tab hide and pagehide, and re-sent
 * every 30 s as a cumulative total (server keeps the max, so retries are harmless). Never one
 * request per second.
 */
export function RouteTracker() {
  const { pathname, search } = useLocation();
  const signature = useMemo(() => pageInfo(pathname, search)?.signature ?? null, [pathname, search]);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (!signature) return;                                        // /admin/* and other untracked routes
    const info = pageInfo(window.location.pathname, window.location.search);
    if (!info) return;
    const pageViewId = startPageView(info);
    if (!pageViewId) return;                                       // analytics off / failed

    const now = () => performance.now();
    const gate = new EngagementGate(now, document.visibilityState === "visible");
    const timer = new EngagementTimer(now, gate.engaged);
    const scroll = new ScrollDepth();
    let reportedId = pageViewId;
    let raf = 0;

    const measure = () => scroll.update(window.scrollY, window.innerHeight, document.documentElement.scrollHeight);
    const syncActive = (engaged: boolean) => timer.setActive(engaged);
    const report = () => {
      const id = currentPageViewId();
      if (!id) return;
      if (id !== reportedId) {                                     // session rotated -> new page view id
        reportedId = id;
        timer.reset(gate.engaged);
        scroll.reset();
      }
      measure();
      reportEngagement(id, timer.seconds(), scroll.percent());
    };

    const onInput = () => syncActive(gate.input());
    const onScroll = () => {
      onInput();
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; measure(); });
    };
    const onVisibility = () => {
      const visible = document.visibilityState === "visible";
      syncActive(gate.setVisible(visible));
      if (!visible) { report(); flushAnalytics(true); }
    };
    const onHide = () => { syncActive(gate.setVisible(false)); report(); flushAnalytics(true); };

    measure();
    const inputEvents = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
    inputEvents.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    const idleTimer = window.setInterval(() => syncActive(gate.tick()), IDLE_CHECK_MS);
    const heartbeat = window.setInterval(() => { if (timer.isActive) report(); }, HEARTBEAT_MS);

    return () => {
      // Route change (or unmount): close out this page view with its final totals.
      syncActive(false);
      report();
      window.clearInterval(idleTimer);
      window.clearInterval(heartbeat);
      if (raf) cancelAnimationFrame(raf);
      inputEvents.forEach((e) => window.removeEventListener(e, onInput));
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [signature]);

  return null;
}
