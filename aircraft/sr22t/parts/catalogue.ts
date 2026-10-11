/**
 * SR22T catalogue: `CAT` with its label lists, and the helpers the section files share: the `part` / `shell` /
 * `surface` / `onSurf` wrappers and the per-frame part animations (no parts). The parts register in the section files;
 * `index.ts` imports them in order.
 */
import * as THREE from "three";
import { Catalogue, chanOfKey, type PartAnim } from "@/lib/catalogue";
import { mats } from "@/lib/materials";
import { clamp, type Vec3 } from "@/lib/math";
import { magFires, sysNow } from "@/lib/anims";
import { AB, paintSkin, wingP } from "../geometry";
import { altAirOpen, live, wastegateOpen } from "../model";
import { useSR22T } from "../store";

import { ENGINE_GROUPS, engineHidden } from "../engine-groups";
import { useEngineGroups } from "../engine-group-store";

export { chanOfKey };

// The ADAHRS, GIAs and the three avionics fans sit behind the displays and the standby instrument, and the bezels frame
// them: listed under "tap to locate" but not labelled, so their pins don't cover the screens (which carry their own labels on the top bezel edge, Airplane.tsx SCREENS).
// MAG 2 is quiet too: it sits beside MAG 1, so its pin would cover MAG 1's.
export const CAT = new Catalogue(
  "sr22t",
  {
    priority: {
      pitot: ["Stall warning computer", "Stall warning pressure switch"],
      // The inboard sensor's left-root label wins over the strainer's; the selector stays clear.
      fuel: ["Fuel selector valve", "Fuel quantity sensor (inboard)"],
    },
    quiet: {
      avionics: [
        "GSU 75 ADAHRS 1",
        "GSU 75 ADAHRS 2",
        "GIA 1 (GIA 63W)",
        "GIA 2 (GIA 63W)",
        "PFD cooling fan",
        "MFD cooling fan",
        "Avionics (IAU) cooling fan",
        "Magnetometer (GMU 44, MAG 2)",
        "PFD bezel",
        "MFD bezel",
      ],
    },
  },
  paintSkin,
  (spec) => engineHidden(spec, sysNow(), useEngineGroups.getState().shown),
  ENGINE_GROUPS,
);
export const { part, surfacePivot, shell, loftSurface: surface, onSurface: onSurf } = CAT;

/* ---------- per-frame part animations ---------- */
export const fires = (mag: "R" | "L") => () => live.rpm > 100 && magFires(mag, useSR22T.getState().s.eng.key);
export const altAnim =
  (which: "alt1" | "alt2"): PartAnim =>
  (m) => {
    const up = useSR22T.getState().E[which],
      sys = sysNow();
    const show = sys === "overview" || sys === "electrical" || sys === "engine";
    m.material = !show ? mats("#D9960F").dim : up ? mats("#D9960F").hi : mats("#5A5040").on;
  };
/** Valve plate travel is illustrative, keyed to the POH 7-39 controller model; with the engine stopped the spring holds
 * the gate open (TCM Overhaul Manual excerpt 81-20, p. 81-04). */
export const wastegateAnim: PartAnim = (m) => {
  m.rotation.x = (wastegateOpen(useSR22T.getState().s) * Math.PI) / 2;
};
export const selPtrAnim: PartAnim = (m) => {
  const sel = useSR22T.getState().s.fuel.sel;
  m.rotation.y = sel === "L" ? Math.PI / 2 : sel === "R" ? -Math.PI / 2 : Math.PI;
};
export const altDoorAnim =
  (x0: number): PartAnim =>
  (m) => {
    m.position.x = x0 - (altAirOpen(useSR22T.getState().s) ? 0.05 : 0);
  };
/** Stall warning inlet span station (pitot.ts); here so `suctionAnim` doesn't import a later section. */
export const STALL_Z = 3.0;
export const suctionAnim: PartAnim = (m) => {
  const aoa = useSR22T.getState().s.stall.aoa,
    xc = clamp(0.32 - (aoa / 14) * 0.32, 0, 0.32);
  m.position.copy(wingP(STALL_Z, xc, aoa >= 14 ? 0 : 1));
  m.visible = sysNow() === "pitot";
};

/* ---------- section helpers ---------- */
/** Left-wing sections reversed, so a mirrored loft keeps its faces outward. */
export const sided = (secs: THREE.Vector3[][], s: number) => (s < 0 ? secs.map((r) => r.reverse()) : secs);

/** Console lever pivot, schematic: POH 13772-007 Fig 7-4 (7-14), 7-32. */
export const CONSOLE_QUADRANT: Vec3 = [1.72, -0.32, 0];
/** MD302 standby screen centre (Airplane.tsx SCREENS), where the pitot-static branches end. */
export const MD302_POS: Vec3 = [2.175, -0.07, -0.245];

/** Key switch on the instrument panel (POH 7-37; AMM Fig 74-30-2 PDF p. 2633); position illustrative. */
export const IGNITION_SWITCH: Vec3 = [2.266, 0.03, -0.47];

/** Illustrative ELT remote-cable passage through FS 222. POH 13772-007 7-91, Fig 7-21 (7-92);
 * AMM 13773-002 Rev 7 Fig 25-60-1 item 2 (PDF 912–913) does not dimension the floor route or penetration. */
export const ELT_BULKHEAD_PASS: Vec3 = [AB, -0.45, 0.05];
export const ELT_PASS_RADIUS = 0.006;
