"use client";
import { useMemo } from "react";
import { Pin } from "@/components/scene/Part";
import { SPOT_COLOR } from "@/lib/spot";
import { useView } from "@/lib/view";
import { stepCentroid } from "./walk";
import { useWalk, walkNow } from "./walk-store";

/** The current SR20 inspection's location. Missing physical details remain explicit in the study card. */
export function WalkMarker() {
  const walking = useView((v) => v.walking && v.ac === "sr20"),
    phase = useWalk((w) => w.phase),
    at = useWalk((w) => w.at);
  const step = walking && phase === "walk" ? walkNow().steps[at] : undefined;
  const centre = useMemo(() => (step ? stepCentroid(step) : null), [step]);
  return step && centre ? <Pin at={centre} label={`${step.item.id} ${step.item.text}`} color={SPOT_COLOR} /> : null;
}
