import { hingeFairingGeo } from "@/lib/geometry";
import { TAIL_PAINT_BOX, paintTail } from "../geometry";
/**
 * Control surfaces (flaps, ailerons, elevator, rudder; pivot on their hinge lines) and the details on them: static
 * wicks, horn balances, hinge brackets and fairings, ground-adjustable trim tabs.
 */
import { V, toVec3 } from "@/lib/math";
import type { SysId } from "@/lib/systems";
import {
  EF,
  finHeight,
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
import { part, sided, surface, onSurf } from "./catalogue";

/* ---------- control surfaces (pivot on their hinge lines) ---------- */
const hp = (s: number, z: number, xc: number) => {
  const c = wC(z),
    [u, l] = af(xc, wT(z), 0.02);
  return V(wLE(z) - xc * c, wY(z) + ((u + l) / 2) * c, s * z);
};
[1, -1].forEach((s) => {
  const side = s > 0 ? "R" : "L";
  const fz = [0.94, 1.8, 2.7, 3.62],
    az = [3.68, 4.3, 5.0];
  surface(
    "flap" + side,
    () =>
      sided(
        fz.map((z) => wingSec(s * z, 0.75, 1)),
        s,
      ),
    hp(s, fz[0], 0.75),
    hp(s, fz[3], 0.75),
    ["flaps", "controls"],
    (s > 0 ? "Right" : "Left") + " flap",
    "Single-slotted aluminum flap on three hinges. 0% / 50% (16°) / 100% (32°).",
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
    "Two-piece aluminum elevator, two hinges per half plus the control sector. Horn-balanced tip.",
  );
});
surface(
  "rudder",
  () => [
    ...[-0.18, 0.05, 0.31, 0.52, 0.8, 1.1, 1.398].map((oldY) => {
      const h = finHeight(oldY);
      return finSec(h, finCut(h), 1);
    }),
    ...[1.4, 1.42, 1.47, 1.51, 1.534].map((h) => finSec(finHeight(h), 0, 1)),
  ],
  V(hingeX(-0.18), -0.18, 0),
  V(hingeX(finHeight(1.44)), finHeight(1.44), 0),
  ["controls"],
  "Rudder",
  "Aluminum, three hinge points on the fin rear shear web. Extends below the stabilizer to the tailcone tip.",
  { box: TAIL_PAINT_BOX, skin: paintTail },
);

/* ---------- control-surface details (Costanzo deck photos) ---------- */
const wickNote =
  "Static wick: bleeds static charge off the trailing edge to cut radio noise. Check it's present on preflight.";
[1, -1].forEach((s) => {
  const side = s > 0 ? "R" : "L";
  onSurf("ail" + side, wingP(s * 4.85, 1.0, 0).add(V(-0.05, 0, 0)), () => cyl(0.004, 0.13, "x", 6), {
    color: "#2A2F33",
    name: "Static wick",
    note: wickNote,
    ext: true,
    pin: s > 0,
  });
  onSurf("elev" + side, V(sLE(1.85) - sC(1.85) - 0.05, SY, s * 1.85), () => cyl(0.004, 0.12, "x", 6), {
    color: "#2A2F33",
    name: "Static wick",
    note: wickNote,
    ext: true,
  });
  // Small schematic mass at the full-chord horn root, inside its thin rounded skin.
  onSurf("elev" + side, V(sLE(1.855) - 0.25 * sC(1.855), SY, s * 1.855), () => box(0.03, 0.012, 0.024), {
    color: "#6E7A84",
    name: "Elevator horn balance + weight",
    pin: s > 0,
    note: "The elevator tip reaches forward of the hinge line (horn) with a balance weight inside, reducing control forces and preventing flutter. (Costanzo deck)",
  });
  (
    [
      [
        1.0,
        "Flap hinge bracket + control arm",
        "Flap hinge bracket. The inboard bracket carries the control arm driven by the flap torque tube. Rub strips on the flap top leading edge protect the cove. (Costanzo deck)",
        ["flaps"],
      ],
      [2.3, "Flap hinge bracket", "One of three hinges per flap.", ["flaps"]],
      [3.55, "Flap hinge bracket", "One of three hinges per flap.", ["flaps"]],
      [3.95, "Aileron hinge fairing", "One of two hinges per aileron.", ["controls"]],
      [4.85, "Aileron hinge fairing", "One of two hinges per aileron.", ["controls"]],
    ] as [number, string, string, SysId[]][]
  ).forEach(([z, name, note, sys], i) =>
    part(() => (i < 3 ? box(0.14, 0.04, 0.025) : hingeFairingGeo(0.22, 0.045, 0.045)), sys, {
      pos: toVec3(wingP(s * z, 0.74, -1).add(V(-0.02, -0.02, 0))),
      color: "#C9D0D5",
      name,
      note,
      ext: true,
      pin: s > 0 && i === 0,
      chan: sys[0] === "controls" ? ["aileron"] : undefined,
    }),
  );
});
onSurf("ailR", wingP(4.3, 0.99, 0).add(V(-0.03, 0, 0)), () => box(0.07, 0.004, 0.12), {
  color: "#8C99A3",
  name: "Aileron trim tab (ground-adjustable)",
  note: "Right aileron only. Factory-set; bent on the ground to trim out a wing-heavy tendency.",
  ext: true,
  pin: true,
});
onSurf("elevR", V(sLE(0.5) - sC(0.5) - 0.03, SY, 0.5), () => box(0.07, 0.004, 0.14), {
  color: "#8C99A3",
  name: "Elevator trim tab (ground-adjustable)",
  note: "Factory-set tab for small neutral-trim corrections. (Costanzo deck)",
  ext: true,
  pin: true,
});
onSurf(
  "rudder",
  V(fLE(finHeight(0.35)) - fC(finHeight(0.35)) - 0.03, finHeight(0.35), 0),
  () => box(0.07, 0.14, 0.004),
  {
    color: "#8C99A3",
    name: "Rudder trim tab (ground-adjustable)",
    note: "Factory-set; the only yaw trim besides the pedal spring cartridge.",
    ext: true,
    pin: true,
  },
);
onSurf(
  "rudder",
  V(fLE(finHeight(1.3)) - fC(finHeight(1.3)) - 0.05, finHeight(1.3), 0),
  () => cyl(0.004, 0.12, "x", 6),
  {
    color: "#2A2F33",
    name: "Static wick",
    note: wickNote,
    ext: true,
  },
);
// The horn narrows sharply toward the rounded tip; fit the internal mass at its root.
onSurf(
  "rudder",
  V(fLE(finHeight(1.43)) - 0.32 * fC(finHeight(1.43)), finHeight(1.43), 0),
  () => box(0.03, 0.022, 0.012),
  {
    color: "#6E7A84",
    name: "Rudder horn balance + weight",
    note: "Top of the rudder extends forward of the hinge with a balance weight — reduces pedal force and flutter risk. (Costanzo deck)",
    pin: true,
  },
);
