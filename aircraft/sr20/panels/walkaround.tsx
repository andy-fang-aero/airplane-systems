"use client";
/** Source-specific SR20 study UI, sharing the existing Cirrus walk styling and common camera/spot/pin infrastructure. */
import { useEffect, useRef, type TouchEvent } from "react";
import { useTicker } from "@/components/ui/controls";
import { revealStage, useView } from "@/lib/view";
import { SYS } from "../systems";
import { clock, loadProgress, stationStart, stepParts, stepPose, stepSide, tally, type Step } from "../walk";
import {
  beginWalk,
  checkpointWalk,
  closeWalk,
  elapsed,
  goStep,
  markStep,
  resetWalk,
  resumeWalk,
  setBig,
  useWalk,
  walkNow,
  type WalkPhase,
} from "../walk-store";
import { GENERAL_WARNING, NOT_MODELLED, SOURCE, SOURCE_URL, THROUGHOUT, WALK } from "../walkaround";
import "../../sr22t/panels/walkaround.css";
import "./walkaround.css";

const NOTICE = "Study aid · use the approved POH checklist for your aircraft.";

function useStepScene(step: Step | undefined, phase: WalkPhase) {
  const previousStation = useRef<number | null>(null);
  useEffect(() => {
    const { flyTo } = useView.getState();
    if (!step) {
      useView.setState({ spot: null, sys: "overview" });
      const [p, t] = phase === "done" ? SYS[0].cam : [WALK[0].cam.p, WALK[0].cam.t];
      flyTo(p, t);
      previousStation.current = null;
      return;
    }
    useView.setState({
      sys: step.item.system,
      spot: { names: stepParts(step).shown, side: stepSide(step) },
      focus: null,
    });
    const pose = stepPose(step);
    if (previousStation.current === step.station.n) {
      flyTo(pose.p, pose.t);
      return;
    }
    previousStation.current = step.station.n;
    flyTo(step.station.cam.p, step.station.cam.t);
    // Match the shared scene's one-second flight before moving closer to the inspection.
    const timer = setTimeout(() => useView.getState().flyTo(pose.p, pose.t), 1100);
    return () => clearTimeout(timer);
  }, [step, phase]);
}
function useStudySession(at: number, walking: boolean) {
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (document.querySelector(".tour")) return;
      const target = document.activeElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "Escape") closeWalk();
      else if (walking && e.key === "ArrowRight") goStep(at + 1);
      else if (walking && e.key === "ArrowLeft") goStep(at - 1);
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", keyboard);
    return () => removeEventListener("keydown", keyboard);
  }, [at, walking]);
  useEffect(() => {
    addEventListener("pagehide", checkpointWalk);
    return () => removeEventListener("pagehide", checkpointWalk);
  }, []);
}
function useSwipe(at: number) {
  const first = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (event: TouchEvent) => {
      const t = event.touches[0];
      first.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (event: TouchEvent) => {
      const a = first.current,
        b = event.changedTouches[0];
      first.current = null;
      if (!a || !b) return;
      const x = b.clientX - a.x,
        y = b.clientY - a.y;
      if (Math.abs(x) > 60 && Math.abs(x) > 1.5 * Math.abs(y)) goStep(x < 0 ? at + 1 : at - 1);
    },
  };
}
function MiniMap({ steps, at, marks }: { steps: Step[]; at: number; marks: Record<string, string> }) {
  return (
    <svg
      className="walk-map"
      viewBox="-80 -64 160 120"
      role="group"
      aria-label="SR20 walk-around stations, POH Figure 4-1"
    >
      <title>SR20 from above, nose up</title>
      <path
        d="M-3.5,-37 L-6,-30 L-6.5,-18 L-6.5,26 L-1.5,34 L1.5,34 L6.5,26 L6.5,-18 L6,-30 L3.5,-37 Z"
        className="fus"
      />
      <path
        d="M-6.5,-18.4 L-58.4,-16.7 L-58.4,-8.5 L-6.5,-4 Z M6.5,-18.4 L58.4,-16.7 L58.4,-8.5 L6.5,-4 Z M-18.6,23 L18.6,23 L18.6,31 L-18.6,31 Z"
        className="wing"
      />
      {WALK.map((station) => {
        const own = steps.filter((s) => s.station === station),
          done = own.every((s) => marks[s.item.id]),
          current = steps[at]?.station === station;
        return (
          <g
            key={station.n}
            className={`stn${current ? " cur" : ""}${done ? " done" : ""}`}
            transform={`translate(${station.map[1] * 10},${-station.map[0] * 10})`}
            role="button"
            tabIndex={0}
            aria-label={`Station ${station.n}: ${station.title}${done ? ", reviewed" : ""}`}
            aria-current={current ? "step" : undefined}
            onClick={() => goStep(stationStart(steps, station.n))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                goStep(stationStart(steps, station.n));
              }
            }}
          >
            <circle r={7.5} />
            <text dy="3.4">{done ? "✓" : station.n}</text>
          </g>
        );
      })}
    </svg>
  );
}
function Intro() {
  const from = useWalk((w) => w.from);
  return (
    <>
      <p className="walk-notice" role="note">
        <b>{NOTICE}</b> This SR20 G6 walk explains the Lycoming/Perspective+ basic-POH inspection. It does not certify
        an aircraft ready for flight.
      </p>
      <div className="walk-warn" role="note">
        <b>Before inspection · POH 4-4</b>
        <p>{GENERAL_WARNING}</p>
        <ul>
          {THROUGHOUT.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <p>Failure to comply can cause serious aircraft damage, loss of the aircraft, or loss of life.</p>
      </div>
      <div className="walk-actions">
        <button type="button" className="walk-go" onClick={beginWalk}>
          {from > 1 ? `Begin at station ${from}` : "Begin study walk"}
        </button>
      </div>
    </>
  );
}
function Resume() {
  const saved = loadProgress(),
    step = walkNow().steps.find((s) => s.item.id === saved?.at);
  return (
    <>
      <p className="walk-notice">
        <b>{NOTICE}</b>
      </p>
      <h3 className="walk-q">Resume SR20 study walk?</h3>
      {step && (
        <p>
          Saved at station {step.station.n}, {step.station.title}: {step.item.id} {step.item.text}.
        </p>
      )}
      <div className="walk-actions">
        <button type="button" className="walk-go" onClick={resumeWalk}>
          Resume
        </button>
        <button type="button" className="btn" onClick={resetWalk}>
          Start over
        </button>
      </div>
    </>
  );
}
function Item({ step, at, steps }: { step: Step; at: number; steps: Step[] }) {
  const marks = useWalk((w) => w.marks),
    swipe = useSwipe(at),
    { station, item } = step;
  const own = steps.filter((s) => s.station === station),
    index = own.indexOf(step),
    missing = stepParts(step).missing;
  return (
    <div className="walk-item" {...swipe}>
      <div className="walk-prog" aria-live="polite">
        Station {station.n} of 13 · item {index + 1} of {own.length}
      </div>
      <div
        className="walk-bar"
        role="progressbar"
        aria-label="Study position"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={at + 1}
      >
        <i style={{ width: `${(100 * (at + 1)) / steps.length}%` }} />
      </div>
      <MiniMap steps={steps} at={at} marks={marks} />
      <h3 className="walk-stn">
        {station.n}. {station.title}
      </h3>
      {station.warning && (
        <p className={`walk-alert ${station.n === 8 ? "caution" : "warning"}`} role="note">
          <b>{station.n === 8 ? "Caution" : "Warning"}</b> {station.warning}
        </p>
      )}
      {station.note && index === 0 && (
        <p className="walk-note">
          <b>Note</b> {station.note}
        </p>
      )}
      <div className="walk-card">
        <div className="walk-line">
          <span className="walk-id">{item.id}</span>
          <span className="walk-text">{item.text}</span>
          {marks[item.id] && (
            <span className={`walk-mark ${marks[item.id]}`}>{marks[item.id] === "ok" ? "✓ Reviewed" : "Skipped"}</span>
          )}
        </div>
        <div className="walk-std">{item.standard}</div>
        {item.note && (
          <p className="walk-note">
            <b>Note</b> {item.note}
          </p>
        )}
        {item.why && <p className="walk-why">{item.why}</p>}
        {missing.length > 0 && (
          <p className="walk-nm">
            Physical detail outside the model: {missing.map((p) => `${p} (${NOT_MODELLED[p]})`).join("; ")}
          </p>
        )}
        <a className="walk-ref" href={SOURCE_URL} target="_blank" rel="noreferrer">
          {item.ref} · SR20 G6 POH
        </a>
      </div>
      <div className="walk-actions">
        <button
          type="button"
          className="walk-nav"
          aria-label="Previous item"
          disabled={at === 0}
          onClick={() => goStep(at - 1)}
        >
          ←
        </button>
        <button type="button" className="btn walk-skip" onClick={() => markStep("skip")}>
          Skip
        </button>
        <button type="button" className="walk-go" onClick={() => markStep("ok")}>
          ✓ Reviewed
        </button>
        <button
          type="button"
          className="walk-nav"
          aria-label="Next item"
          disabled={at === steps.length - 1}
          onClick={() => goStep(at + 1)}
        >
          →
        </button>
      </div>
      <details className="walk-through">
        <summary>Throughout the walk-around</summary>
        <ul>
          {THROUGHOUT.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <span className="walk-ref">POH 4-4</span>
      </details>
    </div>
  );
}
function Done({ steps }: { steps: Step[] }) {
  const w = useWalk(),
    counts = tally(steps, w.marks);
  return (
    <div className="walk-done">
      <h3 className="walk-q">Study walk complete</h3>
      <dl className="walk-sum">
        <dt>Reviewed</dt>
        <dd>{counts.ok}</dd>
        <dt>Skipped</dt>
        <dd>{counts.skip}</dd>
        <dt>Unmarked</dt>
        <dd>{counts.open}</dd>
        <dt>Time</dt>
        <dd>{clock(elapsed(w))}</dd>
      </dl>
      <p className="walk-next">
        The POH continues with <b>Before Engine Start</b> on page 4-9.
      </p>
      <p className="walk-notice">
        <b>{NOTICE}</b>
      </p>
      <div className="walk-actions">
        <button type="button" className="btn" onClick={() => goStep(steps.length - 1)}>
          Review items
        </button>
        <button type="button" className="btn" onClick={resetWalk}>
          Reset
        </button>
        <button type="button" className="walk-go" onClick={closeWalk}>
          Exit
        </button>
      </div>
    </div>
  );
}
export function WalkPanel() {
  const phase = useWalk((w) => w.phase),
    at = useWalk((w) => w.at),
    big = useWalk((w) => w.big),
    { steps } = walkNow();
  const step = phase === "walk" ? steps[at] : undefined;
  useTicker(1000);
  useStepScene(step, phase);
  useStudySession(at, phase === "walk");
  useEffect(revealStage, [at, phase]);
  return (
    <div className={`walk sr20-walk${big ? " walk-big" : ""}`}>
      <div className="walk-hd">
        <span className="walk-title">SR20 preflight study walk</span>
        <button type="button" className="walk-x" aria-label="Exit the SR20 study walk" onClick={closeWalk}>
          Exit
        </button>
      </div>
      {phase === "intro" ? (
        <Intro />
      ) : phase === "resume" ? (
        <Resume />
      ) : phase === "done" ? (
        <Done steps={steps} />
      ) : step ? (
        <Item step={step} at={at} steps={steps} />
      ) : null}
      <div className="walk-ft">
        <label className="walk-opt">
          <input type="checkbox" checked={big} onChange={(e) => setBig(e.target.checked)} /> Larger text
        </label>
        <span className="walk-src">
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            {SOURCE}
          </a>
        </span>
      </div>
    </div>
  );
}
