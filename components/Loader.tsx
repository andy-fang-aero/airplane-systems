"use client";
import { useEffect, useState } from "react";
import { useAircraft } from "@/aircraft";
import { skipBuild, useBuild, type BuildStage } from "@/lib/build";

const TEXT: Record<Exclude<BuildStage, "ready">, string> = {
  code: "Loading",
  airframe: "Building the airframe",
  shaders: "Compiling shaders",
  systems: "Adding systems",
};

/** Set once a scene has been completed: later builds (another airplane) fade the overlay in after a moment instead. */
let completedOnce = false;

/**
 * Loading overlay over the 3D view, from the first paint (it is in the static HTML) until the scene is complete: the
 * airplane's name, a spinner and the build stage; while systems are added part by part (the camera already responds) it
 * shrinks to a bar with the part count and an Add all button (the rest at once, no build-in glow). It carries `data-building`
 * while shown.
 */
export function Loader() {
  const def = useAircraft();
  const { stage, done, total } = useBuild();
  // every view is served the same static HTML: name the airplane only once mounted (as App does for the tab title)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (stage === "ready") completedOnce = true;
  }, [stage]);
  if (stage === "ready") return null;
  const bar = stage === "systems";
  return (
    <div
      className={`loader${bar ? " loader-bar" : ""}${completedOnce ? " loader-later" : ""}`}
      role="status"
      aria-live="polite"
      data-building={stage}
    >
      <div className="loader-card">
        <span className="spinner" aria-hidden="true" />
        <span className="loader-text">
          {mounted && <b>{def.name} </b>}
          {TEXT[stage]}
          {bar ? ` ${done} / ${total}` : "…"}
        </span>
        {bar && <progress max={total} value={done} />}
        {bar && (
          <button
            type="button"
            className="loader-skip"
            onClick={skipBuild}
            aria-label="Add all the remaining parts now"
            title="Add all the remaining parts now"
          >
            Add all
          </button>
        )}
      </div>
    </div>
  );
}
