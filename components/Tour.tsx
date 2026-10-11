"use client";
/**
 * Welcome tour: a few cards that spotlight the parts of the page in turn. The page stays usable underneath (only the card
 * takes pointer input), so visitors can try each thing as it is pointed out. Shown once on a first visit; skipping or
 * finishing it is remembered, and the toolbar's ? button replays it.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { create } from "zustand";
import { narrowLayout } from "@/lib/view";

const DONE_KEY = "tourDone";

type Place = "right" | "left" | "bottom" | "top" | "inside";
interface Step {
  title: string;
  body: ReactNode;
  /** element to spotlight; none centres the card */ sel?: string;
  place?: Place;
}

const STEPS: Step[] = [
  {
    title: "Welcome aboard",
    body: (
      <>
        Interactive 3D study models of airplane systems, built from POH/AFM Section 7. This quick tour shows you around,
        and everything stays usable while it&apos;s open, so try things as you go.
      </>
    ),
  },
  {
    sel: ".fleet",
    place: "right",
    title: "Pick an airplane",
    body: (
      <>
        Switch between the SR20, SR22T, 172S, 182T, DA40 and M20C. Each airplane keeps its own switch positions while
        you look at another. Try one now.
      </>
    ),
  },
  {
    sel: ".syslist",
    place: "right",
    title: "Pick a system",
    body: <>Choose a system and the camera flies to it. The number beside each one is its page in the POH/AFM.</>,
  },
  {
    sel: ".stage",
    place: "inside",
    title: "Explore the model",
    body: (
      <>
        Drag to orbit, scroll or pinch to zoom, right-drag or two-finger drag to pan. Hover or tap a part to read its
        note.
      </>
    ),
  },
  {
    sel: ".toolbar",
    place: "bottom",
    title: "Change the view",
    body: (
      <>
        See through the skin with X-ray, show or hide labels, auto-rotate, switch between light and dark, or reset the
        camera.
      </>
    ),
  },
  {
    sel: ".panel",
    place: "left",
    title: "Operate the systems",
    body: (
      <>
        Each system&apos;s notes and controls live here: switches, levers, breakers and failures. The systems are
        linked, so a change in one shows up in the others.
      </>
    ),
  },
  {
    sel: ".cas",
    place: "top",
    title: "Watch the alerts",
    body: (
      <>
        This window shows the airplane&apos;s crew alerts or annunciators. Try failing an alternator under Electrical
        and watch it respond.
      </>
    ),
  },
  {
    title: "You're all set",
    body: (
      <>
        Replay this tour any time from the ? button in the toolbar. This is an unofficial study aid: always use the
        POH/AFM and supplements for your serial number.
      </>
    ),
  },
];

const useTour = create<{ step: number | null }>(() => ({ step: null }));
export const startTour = () => useTour.setState({ step: 0 });
/** Close the tour (skipped or finished) and remember it, so it isn't shown again on the next visit. */
function endTour() {
  useTour.setState({ step: null });
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {}
}
/** Go to step `i`: past the last step finishes the tour, before the first does nothing. */
function go(i: number) {
  if (i >= STEPS.length) endTour();
  else if (i >= 0) useTour.setState({ step: i });
}

const M = 12,
  GAP = 12,
  PAD = 6;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/** Top-left of a w×h card beside target `t`: the preferred side if it fits, else another side, else inside the target. */
function placeCard(t: DOMRect | null, w: number, h: number, pref?: Place): [number, number] {
  const vw = innerWidth,
    vh = innerHeight;
  const cx = (x: number) => clamp(x, M, vw - w - M),
    cy = (y: number) => clamp(y, M, vh - h - M);
  if (!t) return [cx((vw - w) / 2), cy((vh - h) / 2)];
  const mid = cx(t.left + t.width / 2 - w / 2);
  const sides: Record<Exclude<Place, "inside">, [number, number, boolean]> = {
    right: [t.right + GAP, cy(t.top), t.right + GAP + w <= vw - M],
    left: [t.left - GAP - w, cy(t.top), t.left - GAP - w >= M],
    bottom: [mid, t.bottom + GAP, t.bottom + GAP + h <= vh - M],
    top: [mid, t.top - GAP - h, t.top - GAP - h >= M],
  };
  // phones stack everything full width, so only above or below can work
  const order =
    pref === "inside"
      ? []
      : narrowLayout()
        ? (["bottom", "top"] as const)
        : ([pref ?? "right", "right", "left", "bottom", "top"] as const);
  for (const k of order) {
    const [x, y, fits] = sides[k];
    if (fits) return [x, y];
  }
  // inside, at the bottom of the target's visible part
  return [mid, cy(Math.min(t.bottom, vh) - h - 2 * M)];
}

export function Tour() {
  const step = useTour((x) => x.step);
  const spot = useRef<HTMLDivElement>(null),
    card = useRef<HTMLDivElement>(null),
    next = useRef<HTMLButtonElement>(null);

  // first visit: show the tour unless it was skipped or finished before
  useEffect(() => {
    let done: string | null = null;
    try {
      done = localStorage.getItem(DONE_KEY);
    } catch {}
    if (done !== "1") startTour();
  }, []);

  const s = step === null ? null : STEPS[step];

  // follow the target as the page lays out, scrolls (phones) or resizes; written straight to the DOM, no re-render per frame
  useLayoutEffect(() => {
    if (!s) return;
    let raf = 0;
    const tick = () => {
      const el = s.sel ? document.querySelector(s.sel) : null,
        sp = spot.current,
        cd = card.current;
      const t = el?.getBoundingClientRect() ?? null;
      if (sp) {
        sp.hidden = !t;
        if (t) {
          // clip to the viewport: the panel can be far taller than the screen on phones
          const l = Math.max(t.left - PAD, 2),
            tp = Math.max(t.top - PAD, 2);
          const r = Math.min(t.right + PAD, innerWidth - 2),
            b = Math.min(t.bottom + PAD, innerHeight - 2);
          Object.assign(sp.style, {
            left: `${l}px`,
            top: `${tp}px`,
            width: `${Math.max(r - l, 0)}px`,
            height: `${Math.max(b - tp, 0)}px`,
          });
        }
      }
      if (cd) {
        const [x, y] = placeCard(t, cd.offsetWidth, cd.offsetHeight, s.place);
        cd.style.left = `${x}px`;
        cd.style.top = `${y}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [s]);

  // phones: the page scrolls, so bring each target into view
  useEffect(() => {
    const el = s?.sel ? document.querySelector(s.sel) : null;
    if (!el || !narrowLayout()) return;
    const tall = el.getBoundingClientRect().height > innerHeight * 0.6;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: tall ? "start" : "center", behavior: smooth ? "smooth" : "auto" });
  }, [s]);

  // focus the card's main button; give focus back to where it was when the tour closes
  const open = step !== null;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    next.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      // arrows step the tour only from the card (or nothing focused), so they still work in sliders and the like
      const a = document.activeElement,
        ours = !a || a === document.body || !!card.current?.contains(a);
      if (e.key === "Escape") endTour();
      else if (!ours) return;
      else if (e.key === "ArrowRight") go(step + 1);
      else if (e.key === "ArrowLeft") go(step - 1);
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [step]);

  if (step === null || !s) return null;
  const last = step === STEPS.length - 1;

  return (
    <div className={`tour${s.sel ? "" : " tour-dim"}`}>
      <div ref={spot} className="tour-spot" hidden />
      <div ref={card} className="tour-card" role="dialog" aria-labelledby="tour-title" aria-describedby="tour-body">
        <div className="tour-count">
          {step + 1} of {STEPS.length}
        </div>
        <h2 id="tour-title">{s.title}</h2>
        <p id="tour-body">{s.body}</p>
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <i key={i} className={i === step ? "on" : ""} />
          ))}
        </div>
        <div className="tour-actions">
          {!last && (
            <button type="button" className="tour-skip" onClick={endTour}>
              Skip tour
            </button>
          )}
          {step > 0 && (
            <button type="button" className="btn" onClick={() => go(step - 1)}>
              Back
            </button>
          )}
          <button ref={next} type="button" className="btn primary" onClick={() => go(step + 1)}>
            {step === 0 ? "Show me around" : last ? "Start exploring" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
