/**
 * Control surfaces (flaps, ailerons, elevator, rudder; pivot on their hinge lines) and the details on and near them: static
 * wicks, elevator and rudder horn balance weights, hinge brackets and fairings, ground-adjustable trim tabs.
 */
import * as THREE from "three";
import { roundEnds, sweepGeo } from "@/lib/geometry";
import { V, toVec3 } from "@/lib/math";
import type { SysId } from "@/lib/systems";
import {
  EF,
  HH,
  HZ,
  SSPAN,
  SY,
  af,
  box,
  cyl,
  fC,
  fLE,
  finCut,
  finSec,
  hingeX,
  sC,
  sLE,
  stabSec,
  wC,
  wLE,
  wT,
  wY,
  wingP,
  wingSec,
} from "../geometry";
import { FLAP_HINGE_Z } from "../rig";
import { part, sided, surface, onSurf } from "./catalogue";

/*
 * ---------- flap hinge geometry ----------
 * Each flap hangs on three hinges, arms bolted to the wing's aft shear web that reach aft below the wing skin to a hinge
 * bolt (AMM 57-40, Fig 57-40-1 PDF p. 2401: inboard, mid and outboard flap hinges). An arm on the flap reaches down to the
 * same bolt, and a fairing on each hinge covers it (AMM 57-50, Fig 57-50-6 PDF p. 2422; fairing on the hinge, PDF p. 2421).
 * The flap therefore turns about the line through the three hinge bolts, below its own skin, which opens the slot as it goes
 * down to 16° and 35.5° (POH 13772-007 7-22; AMM 27-50 PDF p. 1055).
 */
/** Model flap span (inboard, outboard edge). */
export const FLAP_Z = [0.94, 3.62] as const;
/**
 * Flap leading edge as a chord fraction: the nose sits in the wing's flap cove, forward of the 0.75 split (POH 7-22: rub
 * strips on the flap's top leading edge keep it off the cove). AMM Fig 51-10-18 (PDF p. 1889) scales to a 17.3 in flap
 * chord at the root and 12.6 in at the tip; this gives 15.9 and 11.6 in. The aileron cables at 0.62 and 0.70 chord (rig.ts)
 * keep it from going deeper. Approximate.
 */
export const FLAP_NOSE = 0.72;
/** Hinge bolt: 10 mm aft of the flap nose and 20 mm below the wing's lower skin at the 0.75 split. Approximate (see below). */
const flapPivotAt = (z: number) => {
  const c = wC(z);
  return V(wLE(z) - FLAP_NOSE * c - 0.01, wingP(z, 0.75, -1).y - 0.02, z);
};
/**
 * The hinge line (side s): through the hinge bolts at the flap's two ends. Placed so the flap clears the cove at every
 * deflection and its nose never rises through the wing's upper skin. At 35.5° the model's leading-edge gap (2-D section
 * estimate) is 1.85 in at the root and 1.17 in at the tip, and its overlap 0.57 and 0.29 in, against AMM Fig 27-50-1
 * (PDF p. 1058) gap 0.917 ± 0.2 / 0.958 ± 0.2 in and overlap 1.512 ± 0.2 / 0.562 ± 0.2 in: the model's cove is
 * shallower than the real one.
 */
export const flapHinge = (s: number) => [flapPivotAt(s * FLAP_Z[0]), flapPivotAt(s * FLAP_Z[1])] as const;
/** Hinge bolt on the hinge line at span station z (side from the sign of z). */
export const flapHingeAt = (z: number) => {
  const [a, b] = flapHinge(Math.sign(z));
  return a.clone().lerp(b, (Math.abs(z) - FLAP_Z[0]) / (FLAP_Z[1] - FLAP_Z[0]));
};
/** Flap section at span z: the wing airfoil from FLAP_NOSE aft, with a rounded nose. Same point order as `wingSec`. */
export const flapSec = (z: number) => {
  const c = wC(z),
    t = wT(z),
    e = 0.02,
    n = 16,
    pt = (xc: number, yy: number) => V(wLE(z) - xc * c, wY(z) + yy * c, z),
    xs = Array.from({ length: n + 1 }, (_, i) => 1 - (1 - FLAP_NOSE - e) * (1 - Math.cos(((i / n) * Math.PI) / 2)));
  const [u, l] = af(FLAP_NOSE + e, t, 0.02),
    mid = (u + l) / 2,
    h = (u - l) / 2;
  return [
    ...xs.map((x) => pt(x, af(x, t, 0.02)[0])),
    ...Array.from({ length: 11 }, (_, k) => {
      const a = ((k + 1) / 12) * Math.PI;
      return pt(FLAP_NOSE + e - e * Math.sin(a), mid + h * Math.cos(a));
    }),
    ...[...xs].reverse().map((x) => pt(x, af(x, t, 0.02)[1])),
  ];
};

/* ---------- control surfaces (pivot on their hinge lines) ---------- */
const hp = (s: number, z: number, xc: number) => {
  const c = wC(z),
    [u, l] = af(xc, wT(z), 0.02);
  return V(wLE(z) - xc * c, wY(z) + ((u + l) / 2) * c, s * z);
};
[1, -1].forEach((s) => {
  const side = s > 0 ? "R" : "L";
  const fz = [FLAP_Z[0], 1.8, 2.7, FLAP_Z[1]],
    az = [3.68, 4.3, 5.0];
  surface(
    "flap" + side,
    () =>
      sided(
        fz.map((z) => flapSec(s * z)),
        s,
      ),
    ...flapHinge(s),
    ["flaps", "controls"],
    (s > 0 ? "Right" : "Left") + " flap",
    "Single-slotted aluminum flap on three hinges; it turns about the hinge bolts below the wing, opening the slot. 0% / 50% (16°) / 100% (35.5°). (POH 7-22; AMM Fig 57-50-6)",
  );
  surface(
    "ail" + side,
    () =>
      sided(
        az.map((z) => wingSec(s * z, 0.75, 1)),
        s,
      ),
    hp(s, az[0], 0.75),
    hp(s, az[2], 0.75),
    ["controls"],
    (s > 0 ? "Right" : "Left") + " aileron",
    "Aluminum, two hinge points. Driven by cable to a sector/crank arm in the wing." +
      (s > 0 ? " Right aileron carries the ground-adjustable trim tab." : ""),
  );
  // the hinge line is straight inboard of the rounded tip
  const ez = [0.1, HZ];
  surface(
    "elev" + side,
    () =>
      sided(
        [
          ...[0.1, 1.0, HZ - 0.002].map((z) => stabSec(s * z, EF, 1)),
          ...[HZ, 1.87, 1.9, 1.925, 1.945, SSPAN].map((z) => stabSec(s * z, 0, 1)),
        ],
        s,
      ),
    V(sLE(ez[0]) - EF * sC(ez[0]), SY, s * ez[0]),
    V(sLE(ez[1]) - EF * sC(ez[1]), SY, s * ez[1]),
    ["controls"],
    "Elevator (" + (s > 0 ? "right" : "left") + " half)",
    "Two-piece aluminum elevator, two hinges per half plus the control sector. Horn-balanced tip (AMM 55-20).",
  );
});
surface(
  "rudder",
  () => [
    ...[-0.18, 0.05, 0.31, 0.52, 0.8, 1.1, HH - 0.002].map((h) => finSec(h, finCut(h), 1)),
    ...[HH, 1.42, 1.47, 1.51, 1.534].map((h) => finSec(h, 0, 1)),
  ],
  V(hingeX(-0.18), -0.18, 0),
  V(hingeX(1.44), 1.44, 0),
  ["controls"],
  "Rudder",
  "Aluminum, three hinge points on the fin rear shear web. Extends below the stabilizer to the tailcone tip.",
);

/* ---------- control-surface details ---------- */
// Static wicks: the POH doesn't mention them; placement per AMM 13773-002 Rev 7 23-60 (PDF p. 674): aileron wick retainers on
// the wing between the wingtip and the aileron, elevator and rudder retainers on the surfaces. Stations approximate.
[1, -1].forEach((s) => {
  const side = s > 0 ? "R" : "L";
  // Retainer at the tip trailing edge, wick projecting aft (AMM Fig 23-60-1 Detail A, PDF p. 679).
  const tip = wingP(s * 5.84, 1, 0);
  part(() => cyl(0.004, 0.13, "x", 6), ["controls"], {
    pos: toVec3(tip.add(V(-0.13 / 2, 0, s * 0.01))),
    color: "#2A2F33",
    name: "Static wick (wing tip)",
    note: "Wing tip precipitation static wick: retainer on a bracket secured to the backing plate and gasket of the anti-collision strobe light assembly (AMM 13773-002 Rev 7 23-60 ¶1A, PDF p. 674; Fig 23-60-1 Detail A, PDF p. 679). Position and dimensions approximate.",
    ext: true,
    pin: s > 0,
  });
  part(() => cyl(0.004, 0.13, "x", 6), ["controls"], {
    pos: toVec3(wingP(s * 5.3, 1.0, 0).add(V(-0.05, 0, 0))),
    color: "#2A2F33",
    name: "Static wick (aileron)",
    note: "Retainer on the wing between the wingtip and the aileron (AMM 13773-002 Rev 7 23-60 ¶1B, PDF p. 674; Fig 23-60-1 Detail B, PDF p. 680); elevator and rudder wicks sit on the surfaces.",
    ext: true,
    pin: s > 0,
  });
  onSurf("elev" + side, V(sLE(1.85) - sC(1.85) - 0.05, SY, s * 1.85), () => cyl(0.004, 0.12, "x", 6), {
    color: "#2A2F33",
    name: "Static wick",
    ext: true,
  });
  // horn balance weight per AMM 55-20 and Fig 55-20-2 Detail A (the POH is silent on it);
  // inboard on the rounded tip cap (HZ to z 1.90), where the cut-back leading edge still clears the box
  onSurf("elev" + side, V(sLE(1.87) - 0.25 * sC(1.87), SY, s * 1.87), () => box(0.05, 0.03, 0.06), {
    color: "#6E7A84",
    name: "Elevator horn balance + weight",
    pin: s > 0,
    note: "Lead balance weight fastened to the inboard and outboard horn ribs at BL 72 (AMM 55-20, Fig 55-20-2 Detail A).",
  });
  // flap hinges, the flap's own hinge arms and the hinge fairings (see the flap hinge geometry above)
  FLAP_HINGE_Z.forEach((z, i) => {
    const h = flapHingeAt(s * z),
      c = wC(z),
      rel = (v: THREE.Vector3) => v.clone().sub(h),
      // forward along the bolt's height to clear the flap nose, then up into the wing to the aft shear web
      fwd = V(wLE(z) - (FLAP_NOSE - 0.02) * c, h.y, s * z),
      web = wingP(s * z, 0.64, 0),
      up = (xc: number) => wingP(s * z, xc, -1).add(V(0, 0.004, 0));
    part(
      () =>
        sweepGeo(
          [V(-0.008, 0, 0), V(0, 0, 0), rel(fwd), rel(web)],
          (t) => [0.006, 0.007 * roundEnds(t, 0.05)],
          [0, 0, 1],
        ),
      ["flaps"],
      {
        pos: toVec3(h),
        color: "#C9D0D5",
        name: "Flap hinge bracket",
        note:
          ["Inboard", "Mid", "Outboard"][i] +
          " flap hinge: an arm bolted to the wing's aft shear web, reaching aft below the skin to the flap's hinge bolt (AMM 57-40, Fig 57-40-1 PDF p. 2401). The flap turns about the line through the three bolts (POH 7-22). Shape and station approximate." +
          (i === 0 ? " Rub strips on the flap's top leading edge keep it off the flap cove (POH 7-22)." : ""),
        ext: true,
        pin: s > 0 && i === 0,
      },
    );
    part(
      () =>
        sweepGeo(
          [V(-0.012, 0, 0), V(0, 0, 0), rel(fwd).add(V(0.02, 0, 0)), rel(web)],
          (t) => [0.016, 0.012 * roundEnds(t, 0.12, 0)],
          [0, 0, 1],
        ),
      ["flaps"],
      {
        pos: toVec3(h),
        color: "#E4E8EB",
        name: "Flap hinge fairing",
        note: "Fairing bolted to the flap hinge, covering it below the wing (AMM 57-50 PDF p. 2421, Fig 57-50-6). Shape approximate.",
        ext: true,
        pin: s > 0 && i === 0,
      },
    );
    onSurf(
      "flap" + side,
      h,
      () => sweepGeo([V(0, 0, 0), rel(up(FLAP_NOSE + 0.03))], (t) => [0.005, 0.006 * roundEnds(t, 0.1, 0)], [0, 0, 1]),
      {
        sys: ["flaps"],
        color: "#B7C0C7",
        name: "Flap hinge arm",
        note: "Arm on the flap reaching down to the hinge bolt (AMM 57-50, Fig 57-50-6 PDF p. 2422). Approximate.",
        ext: true,
      },
    );
  });
  (
    [
      [3.95, "Aileron hinge fairing", "One of two hinges per aileron.", ["controls"]],
      [4.85, "Aileron hinge fairing", "One of two hinges per aileron.", ["controls"]],
    ] as [number, string, string, SysId[]][]
  ).forEach(([z, name, note, sys]) =>
    part(() => box(0.34, 0.05, 0.025), sys, {
      pos: toVec3(wingP(s * z, 0.74, -1).add(V(-0.02, -0.02, 0))),
      color: "#C9D0D5",
      name,
      note,
      ext: true,
      // unpinned, as before the flap hinges moved out of this list (they were its first entries)
      pin: false,
      chan: sys[0] === "controls" ? ["aileron"] : undefined,
    }),
  );
});
onSurf("ailR", wingP(4.3, 0.99, 0).add(V(-0.03, 0, 0)), () => box(0.07, 0.004, 0.12), {
  color: "#8C99A3",
  name: "Aileron trim tab (ground-adjustable)",
  note: "Right aileron only: small adjustments in neutral trim. Factory set; does not normally need adjustment (POH 7-9).",
  ext: true,
  pin: true,
});
onSurf("elevR", V(sLE(0.5) - sC(0.5) - 0.03, SY, 0.5), () => box(0.07, 0.004, 0.14), {
  color: "#8C99A3",
  name: "Elevator trim tab (ground-adjustable)",
  note: "Small adjustments in neutral trim. Factory set; does not normally need adjustment (POH 7-6).",
  ext: true,
  pin: true,
});
onSurf("rudder", V(fLE(0.35) - fC(0.35) - 0.03, 0.35, 0), () => box(0.07, 0.14, 0.004), {
  color: "#8C99A3",
  name: "Rudder trim tab (ground-adjustable)",
  note: "Small adjustments in neutral trim. Factory set; does not normally need adjustment (POH 7-11).",
  ext: true,
  pin: true,
});
onSurf("rudder", V(fLE(1.3) - fC(1.3) - 0.05, 1.3, 0), () => cyl(0.004, 0.12, "x", 6), {
  color: "#2A2F33",
  name: "Static wick",
  ext: true,
});
// horn balance weight per AMM Fig 55-40-1 Detail B (the POH is silent on it)
onSurf("rudder", V(fLE(1.46) - 0.3 * fC(1.46), 1.46, 0), () => box(0.06, 0.04, 0.03), {
  color: "#6E7A84",
  name: "Rudder horn balance + weight",
  note: "Lead-washer mass balance in the rudder horn cap, ahead of the hinge line (AMM 55-40, Fig 55-40-1 Detail B).",
  pin: true,
});
