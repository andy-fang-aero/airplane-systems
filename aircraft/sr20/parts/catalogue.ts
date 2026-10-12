/**
 * SR20 catalogue: `CAT` with its label lists, and the helpers the section files share: the `part` / `shell` /
 * `surface` / `onSurf` wrappers and the per-frame part animations (no parts). The parts register in the section files;
 * `index.ts` imports them in order.
 */
import * as THREE from "three";
import { Catalogue, chanOfKey, type PartAnim } from "@/lib/catalogue";
import { mats } from "@/lib/materials";
import { clamp } from "@/lib/math";
import { magFires, sysNow } from "@/lib/anims";
import { paintSkin, wingP } from "../geometry";
import { live } from "../model";
import { useSR20 } from "../store";
import { useView } from "@/lib/view";
import { ENGINE_GROUPS, engineHidden } from "../engine-groups";
import { useEngineGroups } from "../engine-group-store";

export { chanOfKey };

// The ADAHRS and GIAs sit behind the displays, and the bezels frame them: listed under "tap to locate" but not labelled, so
// their pins don't cover the screens (which carry their own labels on the top bezel edge, Airplane.tsx SCREENS).
export const CAT = new Catalogue(
  "sr20",
  {
    quiet: {
      avionics: [
        "GSU 75 ADAHRS 1",
        "GSU 75 ADAHRS 2 (optional)",
        "GIA 1 (GIA 63W/64W)",
        "GIA 2 (GIA 63W/64W)",
        "PFD bezel",
        "MFD bezel",
        "Fuel flow transducer",
        "Tachometer pickup",
        "Oil temperature sensor",
        "Oil pressure sensor",
        "MAT sensor",
        "MAP sensor",
        "Engine sensor harness / firewall connector",
      ],
    },
  },
  paintSkin,
  (spec) => !useView.getState().walking && engineHidden(spec, sysNow(), useEngineGroups.getState().shown),
  ENGINE_GROUPS,
);
export const { part, surfacePivot, shell, loftSurface: surface, onSurface: onSurf } = CAT;

/* ---------- per-frame part animations ---------- */
export const fires = (mag: "R" | "L") => () => live.rpm > 100 && magFires(mag, useSR20.getState().s.eng.key);
export const altAnim =
  (which: "alt1" | "alt2"): PartAnim =>
  (m) => {
    const up = useSR20.getState().E[which],
      sys = sysNow();
    const show = sys === "overview" || sys === "electrical" || sys === "engine";
    m.material = !show ? mats("#D9960F").dim : up ? mats("#D9960F").hi : mats("#5A5040").on;
  };
export const selPtrAnim: PartAnim = (m) => {
  const sel = useSR20.getState().s.fuel.sel;
  m.rotation.y = sel === "L" ? Math.PI / 2 : sel === "R" ? -Math.PI / 2 : Math.PI;
};
export const altDoorAnim =
  (x0: number): PartAnim =>
  (m) => {
    m.position.x = x0 - (useSR20.getState().s.eng.altAir ? 0.05 : 0);
  };
/** Stall warning inlet span station (pitot.ts); here so `suctionAnim` doesn't import a later section. */
export const STALL_Z = 3.0;
export const suctionAnim: PartAnim = (m) => {
  const aoa = useSR20.getState().s.stall.aoa,
    xc = clamp(0.32 - (aoa / 14) * 0.32, 0, 0.32);
  m.position.copy(wingP(STALL_Z, xc, aoa >= 14 ? 0 : 1));
  m.visible = sysNow() === "pitot";
};

/* ---------- section helpers ---------- */
/** Left-wing sections reversed, so a mirrored loft keeps its faces outward. */
export const sided = (secs: THREE.Vector3[][], s: number) => (s < 0 ? secs.map((r) => r.reverse()) : secs);
