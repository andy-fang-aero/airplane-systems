/** Schematic component locations: AMM 13773-002 Rev 7 Fig. 30-00-1, PDF 1169. */
import * as THREE from "three";
import { bladeDisplayPitch } from "../model";
import { CRANK_Y } from "../engine-datum";
import { toVec3, type Vec3 } from "@/lib/math";
import { box, cyl, loft, sph, tubeGeo, wingP, wingSec, wLE, wY, sLE, SY, fLE } from "../geometry";
import type { SysId } from "@/lib/systems";
import { CAT, part, sided, surfacePivot, STALL_Z } from "./catalogue";
import { glowAnim } from "@/lib/anims";
import { useSR22T } from "../store";
import { REAR_CUSHION_X } from "./cabin";
import { stallStripPath, STALL_STRIP_RADIUS } from "../stall-strip-layout";

// Html pins render through a portal, so hiding a mesh alone leaves a floating label: `fitted` also drops unfitted TKS parts
// from the scene and part lists, and each part keeps its visibility animation.
const fiki = () => useSR22T.getState().s.equip.fiki;
const SR = () => useSR22T.getState();
const visible = (m: THREE.Mesh) => {
  m.visible = fiki();
};
function block(name: string, pos: Vec3, size: Vec3, note: string, ext = false, parent?: string, anim = visible) {
  if (parent?.startsWith("surf:")) {
    const pivot = surfacePivot(parent.slice(5));
    pos = [pos[0] - pivot[0], pos[1] - pivot[1], pos[2] - pivot[2]];
  }
  part(() => box(...size), ["ice"], {
    name,
    pos,
    note: `${note} Schematic dimensions and placement.`,
    ext,
    parent,
    pin: true,
    anim,
    fitted: fiki,
  });
}
/**
 * TKS wing tank: a sealed wet bay bounded by the skins, the main spar web and the inboard, outboard and lateral tank ribs
 * (AMM 30-00, PDF 1166; 30-07, PDF 1192). No rib station is dimensioned, so the envelope is scaled from AMM Fig. 6-00-7
 * (PDF 124, lower-wing access panels, against the model's root and tip):
 * - z0: inboard rib at the wing root, just outboard of the fuselage side (|z| about 0.645, geometry.ts), beside access
 *   panel LW2 / RW2 (about |z| 0.75) and fuel-tank root panel LW3 / RW3 (about 0.7)
 * - z1: outboard rib inboard of its NACA vent panel LW5 / RW5 (about 1.2), "just outboard of the tanks" (AMM 30-00). Set
 *   to 1.05 so the closed loft holds the AMM 30-00 4.25 gal; the rib station scaled from Fig. 6-00-7 (1.18) gives 5.6 gal
 * - xc1: aft wall on the main spar web, kept forward of the model's spar tube (xc 0.3, radius 0.04; structure.ts), so the
 *   bay stays clear of the fuel tank aft of the spar (TANK_CHORD in fuel.ts)
 * - xc0: lateral rib at the leading-edge bay that panel LW4 / RW4 "Wing Inboard" opens (about xc 0.09); LW2 / RW2 sits at
 *   about xc 0.22
 * - depth: the skins less a 5 % allowance for skin and stiffeners
 * All four limits are approximate. The loft holds about 4.2 US gal against the 4.25 gal tank (AMM 30-00, PDF 1166). AMM
 * Fig. 30-00-1 (PDF 1169) is a schematic with no dimensions: it puts the tank at the wing root behind the porous panels, the
 * filler neck and vent outboard of it, the drain valve on its floor at the outboard end and the outlet strainer at its
 * inboard end. The model keeps the filler over the tank, position approximate, and draws no drain valve.
 */
export const TKS_TANK = { z0: 0.68, z1: 1.05, xc0: 0.1, xc1: 0.26, depth: 0.95 };
const tankZ = (TKS_TANK.z0 + TKS_TANK.z1) / 2,
  tankXc = (TKS_TANK.xc0 + TKS_TANK.xc1) / 2;
/** Point in the tank at span |z| and chord fraction xc, `dy` above its floor (the lower skin less the depth allowance). */
const inTank = (side: number, z: number, xc: number, dy: number) => {
  const mean = wingP(side * z, xc, 0);
  return mean
    .clone()
    .lerp(wingP(side * z, xc, -1), TKS_TANK.depth)
    .add(new THREE.Vector3(0, dy, 0));
};
/** Porous panel construction (AMM 30-10, PDF 1226). */
const POROUS =
  "Front titanium plate with laser-drilled holes, porous plastic membrane, back titanium plate; fluid fills the reservoir between the plates and weeps out (AMM 30-10, PDF 1226).";
/**
 * Leading-edge points sampled every ~1 cm of span or height, so a tube through them stays on the loft's own LE instead
 * of cutting across a kink between two far-apart samples.
 */
const along = (a: number, b: number, at: (t: number) => Vec3): Vec3[] => {
  const n = Math.max(2, Math.ceil(Math.abs(b - a) / 0.01));
  return Array.from({ length: n + 1 }, (_, i) => at(a + ((b - a) * i) / n));
};
/** Elevator tip panel span |z|: the panel is bonded round the rounded horn leading edge outboard of HZ (Fig. 30-07-2 sheet 6 Detail F, PDF 1222). */
const TIP_PANEL = [1.84, 1.94] as const;
/** Fin panel heights, from the dorsal-fillet blend up to the panel's upper (inlet) end. */
const FIN_PANEL = [0.52, 1.39] as const;
/**
 * Horn leading edge at span |z|: sLE less 5 mm, the most the elevator loft's straight runs between its horn sections fall
 * aft of the curved sLE outline, so the panel and its fittings sit on the drawn skin.
 */
const hornLE = (side: number, z: number): Vec3 => [sLE(z) - 0.005, SY, side * z];
const elevOf = (side: number) => (side < 0 ? "elevL" : "elevR");
/** An airplane-frame point in the moving elevator group's frame (the elevator tip panel rides the elevator). */
const onElev = (side: number, p: Vec3): Vec3 => {
  const pivot = surfacePivot(elevOf(side));
  return [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
};
for (const side of [-1, 1]) {
  const label = side < 0 ? "Left" : "Right";
  for (const [start, end, section] of [
    [0.75, 2.55, "inboard"],
    [2.7, 5.3, "outboard"],
  ] as const) {
    const points: Vec3[] = Array.from({ length: 12 }, (_, n) => {
      const z = side * (start + ((end - start) * n) / 11);
      return [wLE(z), wY(z), z];
    });
    part(() => tubeGeo(points, 0.025), ["ice"], {
      name: `${label} ${section} porous panel`,
      note: `Wing leading-edge porous panel. ${POROUS} Schematic width and span (Fig. 30-00-1, PDF 1169).`,
      ext: true,
      pin: true,
      anim: visible,
      fitted: fiki,
    });
  }
  const tail: Vec3[] = [0.15, 0.7, 1.2, 1.65].map((z) => [sLE(z), SY, side * z]);
  part(() => tubeGeo(tail, 0.025), ["ice"], {
    name: `${label} stabilizer porous panel`,
    note: `Horizontal stabilizer leading-edge panel. ${POROUS} Schematic span.`,
    ext: true,
    pin: true,
    anim: visible,
    fitted: fiki,
  });
  // Detail F draws the tip panel as a curved strip wrapped round the horn's rounded leading corner, inlet at its inboard
  // end; the strip follows the horn LE (sLE outboard of HZ). Span and the 25 mm tube depiction are approximate: the figure
  // is undimensioned.
  const tipPanel = along(TIP_PANEL[0], TIP_PANEL[1], (z) => onElev(side, hornLE(side, z)));
  part(() => tubeGeo(tipPanel, 0.025), ["ice"], {
    name: `${label} elevator tip porous panel`,
    note: `Elevator tip panel, bonded round the rounded horn leading edge (AMM Fig. 30-07-2 sheet 6 Detail F, PDF 1222; Fig. 30-00-1, PDF 1169). ${POROUS} Span approximate: neither figure is dimensioned.`,
    ext: true,
    pin: true,
    parent: `surf:${elevOf(side)}`,
    anim: visible,
    fitted: fiki,
  });
  const tankAt = wingP(side * tankZ, tankXc, 0);
  part(
    () =>
      loft(
        sided(
          [TKS_TANK.z0, tankZ, TKS_TANK.z1].map((z) =>
            wingSec(side * z, TKS_TANK.xc0, TKS_TANK.xc1, TKS_TANK.depth).map((p) => p.sub(tankAt)),
          ),
          side,
        ),
      ),
    ["ice"],
    {
      name: `${label} TKS tank`,
      pos: toVec3(tankAt),
      note:
        "Integral wing wet bay: 4.25 gal total, 4.0 usable, bounded by the upper and lower skins, the main spar web and the inboard, outboard and lateral tank ribs (AMM 30-00, PDF 1166; 30-07, PDF 1192). At the wing root forward of the main spar, so the fuel tank aft of the spar is clear of it; behind access panel " +
        (side < 0 ? "LW2" : "RW2") +
        ", inboard of NACA vent panel " +
        (side < 0 ? "LW5" : "RW5") +
        " (AMM Fig. 6-00-7, PDF 124). Rib stations scaled from that figure, approximate.",
      pin: true,
      anim: visible,
      fitted: fiki,
    },
  );
  part(() => cyl(0.035, 0.015), ["ice"], {
    pos: toVec3(wingP(side * tankZ, tankXc, 1)),
    name: `${label} TKS filler`,
    note: "Upper wing filler. USE ONLY AL-5 (DTD-406B) FLUID (POH 2-26; AMM 30-00, PDF 1166). Schematic size.",
    ext: true,
    pin: true,
    anim: visible,
    fitted: fiki,
  });
  // Both nozzles sit together at the LH (pilot) windshield base, fed up the LH side of the firewall (AMM Fig. 30-40-1
  // Detail A, PDF 1257; Fig. 30-07-2 sheets 1 and 8 Detail J, PDF 1217, 1224); offset and spacing approximate
  block(
    `${side < 0 ? "Outboard" : "Inboard"} windshield nozzle`,
    [2.4, 0.25, -0.2 + side * 0.035],
    [0.04, 0.025, 0.025],
    "One of two individual spray nozzles side by side at the LH (pilot) windshield base (AMM 30-40, PDF 1254; Fig. 30-40-1 Detail A, PDF 1257; Fig. 30-07-2 sheets 1 and 8, PDF 1217, 1224); lateral offset and spacing approximate.",
    true,
  );
}
// Sampled along the fin loft's LE, so it follows the dorsal-fillet kink at h 0.58 instead of cutting ahead of it.
const vertical = along(FIN_PANEL[0], FIN_PANEL[1], (h) => [fLE(h), h, 0]);
part(() => tubeGeo(vertical, 0.025), ["ice"], {
  name: "Vertical stabilizer porous panel",
  note: `Vertical stabilizer leading-edge panel, on the fin leading edge with the inlet at its upper end (AMM 30-00, PDF 1167; Fig. 30-07-2 sheet 6 Detail G, PDF 1222). ${POROUS} Schematic span: Fig. 30-00-1 (PDF 1169) is undimensioned.`,
  ext: true,
  pin: true,
  anim: visible,
  fitted: fiki,
});
// AMM 30-60 p. 2 (PDF 1259): the ring mounts to the spinner bulkhead, on the same prop axis.
const SLINGER: Vec3 = [3.75, CRANK_Y, 0];
part(() => new THREE.TorusGeometry(0.18, 0.012, 8, 40).rotateY(Math.PI / 2), ["ice"], {
  pos: SLINGER,
  name: "Propeller slinger ring",
  note: "Spinner backing plate; centrifugal force carries the fluid to three feed tubes and the grooved blade-root boots (AMM 30-00, PDF 1168; 30-60, PDF 1258). Schematic size.",
  ext: true,
  pin: true,
  anim: visible,
  fitted: fiki,
});
const SEAT =
  "Below LH passenger seat (AMM 30-00, PDF 1167–1168; Fig. 30-00-1, PDF 1169; Fig. 30-07-2 sheet 2, PDF 1218).";
const BUSES =
  "Powered through ICE PROTECT 1 (7.5 A, MAIN BUS 1) and ICE PROTECT 2 (5 A): AMM 30-00 (PDF 1166) puts ICE PROTECT 2 on Essential Bus 2 and AMM 30-07 (PDF 1192) on Main Bus 1; the POH governs, Essential Bus 2 (POH Fig. 7-10, 7-48).";
const PUMP =
  "Single-speed, constant-volume; the manifolds of both metering pumps are connected in series and primed by the windshield / priming pump (AMM 30-00, PDF 1167).";
for (const [n, z, note] of [
  ["Metering pump 1", -0.38, `${PUMP} ${BUSES}`],
  ["Metering pump 2", -0.23, `${PUMP} ${BUSES}`],
  [
    "Windshield / priming pump",
    -0.08,
    "Supplies the windshield nozzles and primes the metering-pump manifolds, purging air between them and the tank (AMM 30-00, PDF 1167–1168).",
  ],
  [
    "Filter assembly",
    -0.5,
    "Mounted adjacent to the pumps; fluid from the metering pumps passes it on the way to the proportioning units (AMM 30-00, PDF 1167).",
  ],
] as const)
  block(n, [0.85, -0.52, z], [0.14, 0.1, 0.1], `${note} ${SEAT}`);
block(
  "Timer Box",
  [-1.6, -0.22, 0.1],
  [0.12, 0.08, 0.07],
  "Bolted to the RH aft longeron beside the GTA 82 pitch trim adapter, behind access panel CF4R (AMM 30-07 Timer Box removal / installation, PDF 1212; Fig. 30-07-2 sheet 5, PDF 1221; Fig. 22-10-3, PDF 572). PUMP BKUP bypasses it to run pump 2 (AMM 30-00, PDF 1167). ICE PROTECT 2: AMM 30-00 (PDF 1166) gives Essential Bus 2, AMM 30-07 (PDF 1192) Main Bus 1; the POH governs, Essential Bus 2 (POH Fig. 7-10, 7-48).",
);
// Storage and pumping hardware without a part before depth round 2, in fluid-path order (AMM Fig. 30-00-1, PDF 1169)
/** Coarse-mesh outlet strainer on the tank's inboard rib, where its tank line leaves (Fig. 30-07-2 sheet 3, PDF 1219). */
const tankOutlet = (side: number) => toVec3(inTank(side, TKS_TANK.z0 + 0.03, 0.22, 0.03));
/** Tank line start, 1 mm outboard of the inboard rib face abeam the outlet strainer, inside its bulkhead fitting (approximate). */
const ribFitting = (side: number): Vec3 => {
  const [x, y] = tankOutlet(side);
  return [x, y, side * (TKS_TANK.z0 - 0.001)];
};
/** Bulkhead fitting through the inboard rib (Fig. 30-07-2 sheet 3 item 1, PDF 1219): it joins the outlet strainer inside the
 * tank to the tank line outside it. Spans 14 mm inboard to 8 mm outboard of the rib face; radius 9 mm. Size approximate: the
 * figure is undimensioned. */
const FITTING = { r: 0.009, inboard: 0.014, outboard: 0.008 };
for (const side of [-1, 1]) {
  const label = side < 0 ? "Left" : "Right",
    panel = side < 0 ? "LW" : "RW";
  part(() => cyl(0.018, 0.05), ["ice"], {
    pos: toVec3(wingP(side * tankZ, tankXc, 1).add(new THREE.Vector3(0, -0.03, 0))),
    name: `${label} TKS filler neck`,
    note: "Filler neck under the upper-wing cap, into the tank (AMM 30-00, PDF 1166; Fig. 30-00-1, PDF 1169). Schematic size.",
    pin: true,
    anim: visible,
    fitted: fiki,
  });
  block(
    `${label} TKS tank vent`,
    toVec3(wingP(side * (TKS_TANK.z1 + 0.05), tankXc, -1).add(new THREE.Vector3(0, -0.006, 0))),
    [0.08, 0.012, 0.06],
    `NACA duct on the lower-skin access panel just outboard of the tank, vented from its outboard rib (AMM 30-00, PDF 1166); panel ${panel}5 "NACA Vent, Inboard" (AMM Fig. 6-00-7, PDF 124).`,
    true,
  );
  block(
    `${label} TKS outlet strainer`,
    tankOutlet(side),
    [0.03, 0.03, 0.05],
    "Coarse-mesh strainer inside the tank at its outlet, on the inboard rib (AMM 30-00, PDF 1166; Fig. 30-00-1, PDF 1169; Fig. 30-07-2 sheet 3, PDF 1219).",
  );
  part(() => cyl(FITTING.r, FITTING.inboard + FITTING.outboard, "z"), ["ice"], {
    pos: [tankOutlet(side)[0], tankOutlet(side)[1], side * (TKS_TANK.z0 + (FITTING.outboard - FITTING.inboard) / 2)],
    color: "#B8C2C8",
    name: `${label} TKS outlet bulkhead fitting`,
    note: "Bulkhead fitting through the tank's inboard rib, joining the outlet strainer inside the tank to the nylon tank line outside it (AMM 30-00, PDF 1166; Fig. 30-07-2 sheet 3 items 1, 4, 15, PDF 1219). Size approximate.",
    anim: visible,
    fitted: fiki,
  });
  block(
    `${label} TKS quantity sensor`,
    toVec3(inTank(side, TKS_TANK.z0 + 0.04, 0.15, 0.07)),
    [0.03, 0.03, 0.08],
    `Float-type quantity sensor (sending unit) secured to the wing rib through a mounting plate, reached through panel ${panel === "LW" ? "LW1" : "RW2"} (AMM 30-00, PDF 1168; 30-07 Deicing Fluid Level Sensor removal, PDF 1209; Fig. 30-07-2 sheet 3, PDF 1219). 12 VDC from the Level Sensor Power Circuit Card (AMM 30-07, PDF 1192).`,
  );
  block(
    `${label} TKS low-level switch`,
    toVec3(inTank(side, TKS_TANK.z0 + 0.03, 0.15, 0.03)),
    [0.025, 0.025, 0.04],
    'Single-point fluid level switch near the tank outlet: a redundant "Empty" indication so the system does not draw air (AMM 30-00, PDF 1168; Fig. 30-07-2 sheet 3, PDF 1219).',
  );
}
// AUTO alternates the selected tank to balance them, which the sim does not model, so the indicator then points aft
const tankSel = () => (SR().s.avx.backup ? "AUTO" : SR().s.ice.sel);
block(
  "3-way control valve",
  [1.6, -0.55, -0.22],
  [0.06, 0.05, 0.08],
  "Selects the LH or RH tank; AUTO balances them by alternating the selected tank (AMM 30-00, PDF 1166). On the forward LH longeron below the forward floor, beside the forward proportioning unit (Fig. 30-07-2 sheet 4 Detail C, PDF 1220).",
);
part(() => box(0.01, 0.008, 0.05).translate(0, 0, 0.025), ["ice"], {
  pos: [1.6, -0.52, -0.22],
  color: "#E8EEF2",
  name: "3-way valve indicator",
  note: "Points to the selected tank: left, right, or aft for AUTO, which display backup forces (AMM 30-00, PDF 1166, 1168). AUTO alternates the tanks, which the sim does not model, so the aft pointer is a model convention.",
  anim: (m) => {
    visible(m);
    const sel = tankSel();
    m.rotation.y = sel === "L" ? Math.PI : sel === "R" ? 0 : -Math.PI / 2;
  },
  fitted: fiki,
});
block(
  "In-line strainer",
  [1.1, -0.52, -0.3],
  [0.12, 0.06, 0.06],
  "Fine-mesh strainer protecting the metering pumps and the windshield / priming pump (AMM 30-00, PDF 1166; Fig. 30-00-1, PDF 1169; Fig. 30-07-2 sheet 2, PDF 1218).",
);
block(
  "Flow meter",
  [0.98, -0.52, -0.3],
  [0.08, 0.05, 0.05],
  "Ultrasonic flow meter between the in-line strainer and the metering pumps; flow goes to the Engine Airframe Unit for the MFD ENGINE page (AMM 30-00, PDF 1168; Fig. 30-07-2 sheet 2, PDF 1218).",
);
// Tank-to-pump tubing: each outlet strainer → bulkhead fitting in the inboard rib → nylon tubing to the
// 3-way control valve on the forward LH longeron, the valve → the in-line strainer, and short tubes on through the flow meter
// and the metering pumps to the filter assembly, which feeds the distribution lines.
// AMM 30-00 PDF 1166–1167; Fig. 30-00-1, PDF 1169; Fig. 30-07-2 sheets 3–4, PDF 1219–1220 (items 1, 4, 15; "TO METERING
// PUMP"). Waypoints and the tube radius are approximate: the figures are undimensioned. Each tube end sits inside the part it
// joins; away from those connected terminals the waypoints keep each tube at least 5 mm off every other part and flow tube
// under the cabin floor. The right line crosses the centreline between the main spar and the forward proportioning unit.
const TANK_LINE_R = 0.006; // approximate, as above
const TANK_LINE_NOTE =
  "Nylon tubing (AMM 30-00, PDF 1166–1167; Fig. 30-00-1, PDF 1169; Fig. 30-07-2 sheets 3–4, PDF 1219–1220). Routing schematic; tube size approximate.";
(
  [
    [
      "Left TKS tank line",
      "Left tank outlet strainer through the inboard rib's bulkhead fitting to the 3-way control valve.",
      [
        ribFitting(-1),
        [1.5, -0.61, -0.6], // approximate waypoints from here on (see the block comment)
        [1.502, -0.61, -0.515],
        [1.535, -0.58, -0.48],
        [1.565, -0.55, -0.45],
        [1.595, -0.536, -0.38],
        [1.61, -0.533, -0.31],
        [1.612, -0.532, -0.254], // 6 mm into the valve body (approximate)
      ],
    ],
    [
      "Right TKS tank line",
      "Right tank outlet strainer through the inboard rib's bulkhead fitting, across the cabin floor to the 3-way control valve.",
      [
        ribFitting(1),
        [1.5, -0.61, 0.55], // approximate waypoints from here on (see the block comment)
        [1.5, -0.61, 0.4],
        [1.5, -0.585, 0.37],
        [1.5, -0.56, 0.33],
        [1.5, -0.547, 0.27],
        [1.5, -0.545, 0.1],
        [1.5, -0.542, -0.04],
        [1.505, -0.537, -0.075],
        [1.53, -0.535, -0.11],
        [1.55, -0.524, -0.14],
        [1.565, -0.52, -0.162],
        [1.58, -0.535, -0.178],
        [1.595, -0.55, -0.186], // 6 mm into the valve body (approximate)
      ],
    ],
    [
      "TKS pump supply line",
      "3-way control valve to the in-line strainer, over the main spar and under the GTS 800; on through the flow meter to the metering pumps.",
      [
        [1.572, -0.55, -0.22], // approximate waypoints (see the block comment)
        [1.5, -0.55, -0.22],
        [1.46, -0.54, -0.235],
        [1.42, -0.53, -0.24],
        [1.38, -0.512, -0.24],
        [1.3, -0.512, -0.24],
        [1.26, -0.54, -0.24],
        [1.2, -0.55, -0.24],
        [1.15, -0.55, -0.24],
        [1.12, -0.53, -0.25],
        [1.1, -0.52, -0.276], // 6 mm into the in-line strainer (approximate)
      ],
    ],
    [
      "TKS flow meter tube",
      "In-line strainer to the ultrasonic flow meter.",
      [
        [1.045, -0.52, -0.3], // approximate (see the block comment)
        [1.03, -0.52, -0.3],
        [1.015, -0.52, -0.3],
      ],
    ],
    [
      "Metering pump manifold tube",
      "Flow meter to the metering pumps, whose manifolds are connected in series (AMM 30-00, PDF 1167).",
      [
        [0.915, -0.52, -0.345], // approximate (see the block comment)
        [0.935, -0.52, -0.33],
        [0.935, -0.52, -0.27],
        [0.915, -0.52, -0.255],
      ],
    ],
    [
      "TKS filter inlet tube",
      "Metering pumps to the filter assembly mounted beside them (AMM 30-00, PDF 1167).",
      [
        [0.85, -0.52, -0.425], // approximate (see the block comment)
        [0.85, -0.52, -0.44],
        [0.85, -0.52, -0.455],
      ],
    ],
  ] as [string, string, Vec3[]][]
).forEach(([name, what, pts]) =>
  part(() => tubeGeo(pts, TANK_LINE_R), ["ice"], {
    name,
    note: `${what} ${TANK_LINE_NOTE}`,
    anim: visible,
    fitted: fiki,
  }),
);
const wsGlow = glowAnim("#9AA3AA", () => fiki() && SR().E.ipsPwr && SR().s.ice.ws > 0, ["ice"]);
block(
  "Windshield solenoid",
  [0.97, -0.52, -0.08],
  [0.05, 0.05, 0.05],
  "Normally closed, between the windshield pump and the spray nozzles; prevents back flow to the metering pumps. Lit while open, during a powered WINDSHLD cycle (AMM 30-00, PDF 1167; Fig. 30-07-2 sheet 2, PDF 1218). Screwed to the LH aft longeron behind access panel CF3L (AMM 30-07 Windshield Solenoid removal, PDF 1213).",
  false,
  undefined,
  (m) => {
    visible(m);
    wsGlow(m, 0);
  },
);
block(
  "Test port",
  [0.6, -0.52, -0.5],
  [0.05, 0.04, 0.04],
  "Test port assembly on the line from the filter assembly to the empennage proportioning unit, for the purge / flow test (AMM 30-00, PDF 1166; Fig. 30-00-1, PDF 1169; Fig. 30-00-2, PDF 1179). Position approximate.",
);
block(
  "Level sensor power card",
  [1.78, -0.45, -0.1],
  [0.08, 0.05, 0.02],
  "Level Sensor Power Circuit Card: converts 28 VDC from the FUEL QTY breaker (MAIN BUS 1) to 12 VDC for the fluid level sensors (AMM 30-07, PDF 1192, which rates the breaker 3 A; the POH governs, 5 A, POH 7-94). No location in the text read; placed behind the circuit breaker panel, position approximate.",
);
block(
  "Forward proportioning unit",
  [1.6, -0.55, 0],
  [0.16, 0.08, 0.15],
  "Cabin floor-forward: supplies the four wing panels and the propeller slinger ring, adding a pressure drop that sets each surface's flow rate (AMM 30-00, PDF 1167). Ports 1 / 2 LH outboard / inboard, 4 / 5 RH inboard / outboard (Fig. 30-07-2 sheet 4, PDF 1220).",
);
block(
  "Empennage proportioning unit",
  [-2, -0.1, 0],
  [0.15, 0.08, 0.1],
  "Supplies the horizontal and vertical stabilizer panels and the elevator tips, adding a pressure drop that sets each surface's flow rate (AMM 30-00, PDF 1167). Ports 1 RH elevator tip, 3 LH elevator tip, 4 LH horizontal, 5 vertical tail, 6 RH horizontal (Fig. 30-07-2 sheet 5, PDF 1221).",
);

/* ---------- distribution: AMM 30-00 PDF 1167–1168; Fig. 30-07-2, PDF 1217–1224. Routing schematic. ---------- */
const FWD_UNIT: Vec3 = [1.6, -0.55, 0];
const EMP_UNIT: Vec3 = [-2, -0.1, 0];
const icePos = (name: string): Vec3 => {
  const p = CAT.parts.find((q) => q.name === name && q.sys.includes("ice"));
  if (!p?.pos) throw new Error(`TKS distribution needs the "${name}" part from the storage block in parts/ice.ts`);
  return p.pos;
};
const FILTER = icePos("Filter assembly");
const NYLON = "Nylon tubing (AMM 30-00, PDF 1167; Fig. 30-07-2, PDF 1218–1223); routing schematic.";
function line(
  name: string,
  points: Vec3[],
  note: string,
  sys: SysId[] = ["ice"],
  r = 0.008,
  pin = true,
  parent?: string,
) {
  part(() => tubeGeo(points, r), sys, { name, note, parent, pin, anim: visible, fitted: fiki });
}
/** Small fitting at a panel end; a point on an elevator tip rides the elevator. */
function fitting(name: string, pos: Vec3, note: string, parent?: string) {
  if (parent?.startsWith("surf:")) {
    const pivot = surfacePivot(parent.slice(5));
    pos = [pos[0] - pivot[0], pos[1] - pivot[1], pos[2] - pivot[2]];
  }
  part(() => sph(0.016), ["ice"], { name, pos, note, parent, ext: true, pin: true, anim: visible, fitted: fiki });
}
const INLET =
  "Proportioned fluid enters through the inlet fitting on the inboard end of the wing and elevator tip panels, the upper end of the vertical panel and the outboard end of the horizontal panels (AMM 30-00, PDF 1167).";
const VENT =
  "Vent opposite the inlet releases air from the panel; a check valve stops air entering through it, slowing leak-down while the system is off (AMM 30-00, PDF 1168).";
const wingEnd = (side: number, z: number): Vec3 => [wLE(z), wY(z), side * z];
const behindWing = (side: number, z: number, d: number): Vec3 => [wLE(z) - d, wY(z), side * z];
const stabEnd = (side: number, z: number): Vec3 => [sLE(z), SY, side * z];
const behindStab = (side: number, z: number, d: number): Vec3 => [sLE(z) - d, SY, side * z];
const off = (p: Vec3, dx: number): Vec3 => [p[0] + dx, p[1], p[2]];

line(
  "Forward unit supply line",
  [FILTER, [1.2, -0.56, -0.3], [1.5, -0.56, -0.08], FWD_UNIT],
  `Filter assembly to the cabin floor-forward proportioning unit. ${NYLON}`,
);
line(
  "Empennage unit supply line",
  [FILTER, [0.3, -0.5, -0.45], [-0.6, -0.4, -0.3], [-1.3, -0.25, -0.12], [-1.85, -0.12, -0.02], EMP_UNIT],
  `Filter assembly to the empennage proportioning unit. ${NYLON}`,
);
for (const side of [-1, 1]) {
  const label = side < 0 ? "Left" : "Right";
  const inboard = wingEnd(side, 0.75),
    outboard = wingEnd(side, 2.7);
  line(
    `${label} inboard panel feed line`,
    [FWD_UNIT, [1.68, -0.56, side * 0.4], off(inboard, -0.03)],
    `Forward proportioning unit to the inboard wing panel inlet. ${NYLON}`,
    ["ice"],
    0.008,
    false,
  );
  line(
    `${label} outboard panel feed line`,
    [
      FWD_UNIT,
      [1.66, -0.57, side * 0.35],
      // in the leading-edge bay, forward of the TKS tank's lateral rib (TKS_TANK.xc0)
      behindWing(side, 0.62, 0.08),
      behindWing(side, 1.0, 0.08),
      behindWing(side, 1.5, 0.1),
      behindWing(side, 2.5, 0.1),
      off(outboard, -0.03),
    ],
    `Forward proportioning unit to the outboard wing panel inlet. ${NYLON}`,
    ["ice"],
    0.008,
    false,
  );
  fitting("Panel inlet fitting", inboard, INLET);
  fitting("Panel inlet fitting", outboard, INLET);
  fitting("Panel vent and check valve", wingEnd(side, 2.55), VENT);
  fitting("Panel vent and check valve", wingEnd(side, 5.3), VENT);
  // AMM 57-20 (PDF 2378, 2386–2389): the inboard stall strip is porous and bonded to the inboard wing panel; span not dimensioned.
  const strip = stallStripPath(side, "inboard");
  part(() => tubeGeo(strip, STALL_STRIP_RADIUS), ["ice", "airframe"], {
    name: `${label} porous stall strip`,
    note: "Porous stall strip replacing the plain inboard strip near the wing root, bonded to the inboard wing panel and fed by a capillary tube from the panel's inlet fitting that sets its own flow rate (AMM 13773-002 Rev 7 30-00, PDF 1168; 57-20, PDF 2378, 2386–2389; Fig 57-20-2 Detail B, PDF 2389). Span, size and round tube depiction approximate.",
    ext: true,
    pin: true,
    anim: visible,
    fitted: fiki,
  });
  // Inside the leading-edge bay, ending behind the skin at the strip's root end rather than out at the strip itself.
  line(
    `${label} stall strip capillary tube`,
    [off(inboard, -0.02), [wLE(0.85) - 0.02, wY(0.85) - 0.012, side * 0.85]],
    "Additional capillary tube from the inboard panel's inlet fitting to the porous stall strip, inside the leading-edge bay (AMM 30-00, PDF 1168). Routing schematic.",
    ["ice"],
    0.004,
    false,
  );
  const horizontal = stabEnd(side, 1.65);
  line(
    `${label} horizontal panel feed line`,
    [
      EMP_UNIT,
      // inside the tailcone and the stabilizer root, behind the LE: Fig. 30-00-1 (PDF 1169) runs the tail lines from the
      // unit along the stabilizer behind its panels
      behindStab(side, 0.05, 0.1),
      behindStab(side, 1.0, 0.08),
      behindStab(side, 1.5, 0.08),
      off(horizontal, -0.03),
    ],
    `Empennage proportioning unit to the horizontal stabilizer panel inlet. ${NYLON}`,
    ["ice"],
    0.008,
    false,
  );
  fitting("Panel inlet fitting", horizontal, INLET);
  fitting("Panel vent and check valve", stabEnd(side, 0.15), VENT);
  const tip = hornLE(side, TIP_PANEL[0]),
    elev = `surf:${elevOf(side)}`;
  // AMM 55-20 PDF 2243: service loop ahead of the horizontal spar; Fig 30-07-2 sheet 1 (PDF 1217).
  // All routing stations approximate. Interpolate the model's actual hinge axis at |z| 1.70, not a rounded x.
  const hinge = CAT.surfaces.find((sf) => sf.key === elevOf(side))!;
  const axisPoint = new THREE.Vector3(...hinge.pivot).addScaledVector(
    new THREE.Vector3(...hinge.axis),
    (side * 1.7 - hinge.pivot[2]) / hinge.axis[2],
  );
  const crossing = toVec3(axisPoint);
  // AMM 30-00 PDF 1187: 3/16-inch supply tubing; radius is half the documented diameter.
  const tipFeedRadius = ((3 / 16) * 0.0254) / 2;
  line(
    `${label} elevator tip feed line`,
    [
      EMP_UNIT,
      behindStab(side, 0.05, 0.15),
      behindStab(side, 1.0, 0.13),
      // Retain the original next station so Catmull-Rom's upstream tangent stays unchanged below |z| 1.0.
      behindStab(side, 1.75, 0.13),
      // Approximate open service-loop bend, contained in the stabilizer loft (AMM 55-20 PDF 2243).
      [-2.65, SY, side * 1.45],
      [-2.71, SY, side * 1.58],
      [-2.76, SY, side * 1.48],
      [-2.81, SY, side * 1.6],
      [-2.83, SY + 0.004, side * 1.695], // approximate oblique spar entry; end-ring vertices straddle the skin seam
      crossing,
    ],
    `Empennage unit through the stabilizer, with the service loop ahead of its spar (AMM 55-20 PDF 2243; Fig. 30-07-2 sheet 1, PDF 1217), ending on the elevator hinge axis. Tube depiction and routing stations approximate.`,
    ["ice"],
    0.008, // approximate schematic radius, retained on the fixed stabilizer run
    false,
  );
  line(
    `${label} elevator tip feed line (elevator)`,
    [
      crossing,
      // Approximate: through elevator holes and aft of the spar to its feed-line bracket (AMM 55-20 PDF 2242–2243).
      [-2.866, SY, side * 1.7], // approximate straight aft entry keeps the tube end ring inside the elevator
      [-2.886, SY, side * 1.72],
      [-2.886, SY, side * 1.8],
      [-2.88, SY, side * 1.835],
      [-2.84, SY, side * 1.835],
      [-2.75, SY, side * 1.835],
      [-2.65, SY, side * 1.835],
      [-2.57, SY, side * 1.835],
      off(tip, -0.012),
    ].map((p) => onElev(side, p as Vec3)),
    `Feed line through the elevator holes, secured to its bracket and tip (AMM 55-20 PDF 2239, 2242–2243; retained through the horizontal spar for balancing, PDF 2250–2251). Rides the elevator to the horn inlet (Fig. 30-07-2 sheet 6 Detail F, PDF 1222). 3/16-inch tubing (AMM 30-00 PDF 1187), passing inboard of the horn weight with a tight illustrative gap of at least 1 mm. Routing stations and in-horn path approximate/inferred from undimensioned figures.`,
    ["ice"],
    tipFeedRadius,
    false,
    elev,
  );
  fitting("Panel inlet fitting", tip, INLET, elev);
  fitting("Panel vent and check valve", hornLE(side, TIP_PANEL[1]), VENT, elev);
}
const finTop: Vec3 = [fLE(FIN_PANEL[1]), FIN_PANEL[1], 0];
line(
  "Vertical panel feed line",
  [EMP_UNIT, [-2.4, 0.15, 0.02], [fLE(0.8) - 0.08, 0.8, 0.02], [fLE(1.3) - 0.08, 1.3, 0.02], off(finTop, -0.03)],
  `Empennage proportioning unit to the vertical stabilizer panel inlet. ${NYLON}`,
  ["ice"],
  0.008,
  false,
);
fitting("Panel inlet fitting", finTop, INLET);
fitting("Panel vent and check valve", [fLE(FIN_PANEL[0]), FIN_PANEL[0], 0], VENT);
// Fig. 30-07-2 sheet 7 (PDF 1223): fluid line, firewall bulkhead fitting, hose assembly, feed tube (45), slinger ring (46).
const feedTube: Vec3[] = [
  [3.6, -0.32, 0.1],
  [3.72, -0.27, 0.06],
];
line(
  "Slinger supply line",
  [FWD_UNIT, [2.1, -0.5, 0.12], [2.61, -0.42, 0.14], [3.2, -0.42, 0.16], feedTube[0]],
  "Forward proportioning unit through a firewall bulkhead fitting and hose assembly to the slinger feed tube (AMM 30-00, PDF 1167; Fig. 30-07-2 sheet 7, PDF 1223). Routing schematic.",
  ["ice"],
  0.008,
  false,
);
line(
  "Slinger feed tube",
  feedTube,
  "Fixed feed tube discharging into the slinger ring on the spinner backing plate (Fig. 30-07-2 sheet 7, PDF 1223; AMM 30-00, PDF 1168). Schematic size.",
  ["ice"],
  0.006,
);
// AMM 13773-002 Rev 7 30-60 p. 2 (PDF 1259), Fig 30-60-1 (PDF 1267):
// two illustrative root grooves. Width (2 mm), depth (2 mm), spacing (10 mm)
// and boot root (0.15 m) are approximate: the figure is undimensioned.
const bootGeo = () => {
  const shape = new THREE.Shape();
  shape.moveTo(0.013, -0.1);
  shape.lineTo(-0.013, -0.1);
  for (const y of [-0.092, -0.082]) {
    shape.lineTo(-0.013, y - 0.001);
    shape.lineTo(-0.011, y - 0.001);
    shape.lineTo(-0.011, y + 0.001);
    shape.lineTo(-0.013, y + 0.001);
  }
  shape.lineTo(-0.013, 0.1);
  shape.lineTo(0.013, 0.1);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06);
};
for (let i = 0; i < 3; i++) {
  // Blade-local: the blade runs out along +y from the hub; the slinger ring lies 0.05 m aft of the propeller plane.
  part(
    () =>
      tubeGeo(
        [
          // AMM 13773-002 Rev 7 Fig 30-60-2 (PDF 1270, note SR22_MM30_5041): at least 0.1 in. (2.54 mm) from
          // any portion of the slinger ring. The inlet clears the ring by 4.7 mm (4.3 mm mesh to mesh) and leaves square
          // to the ring's plane; approximate, the figure is undimensioned apart from its clearance notes.
          [-0.05, 0.158, -0.02],
          [-0.03, 0.158, -0.02],
          // AMM 30-60 p. 2 §2.A(3) (PDF 1259): over the second groove at full fine,
          // with 2.5–5.1 mm surface gap. Approximate route; the 4 mm tube radius
          // is illustrative. Tip z = 0 removes lateral stand-off near the pitch axis,
          // avoiding the boot's pitch sweep; x is approximate, chosen for the full-fine gap.
          [-0.021, 0.168, 0],
        ],
        0.004,
      ),
    ["ice", "propeller"],
    {
      parent: "blade:" + i,
      name: "Boot feed tube",
      note: "One of three feed tubes taking fluid from the slinger ring to the grooves of a blade boot (AMM 30-60, PDF 1258; Fig. 30-60-1, PDF 1267; Fig. 30-60-2, PDF 1270). Fixed to the spinner bulkhead and hub p-clips, so it spins without blade pitch (AMM 30-60 p. 2, PDF 1259; 61-10 p. 4 item (e), PDF 2441). Tip over the second groove at full fine, 2.5–5.1 mm gap (30-60 §2.A(3)); at least 0.1 in. from the slinger ring and 0.25 in. from the hub (Fig. 30-60-2 notes, PDF 1270); geometry approximate, undimensioned figures.",
      ext: true,
      // Hub p-clips stay fixed while blade pitch changes (AMM 61-10 p. 4 item (e), PDF 2441).
      // Cancel the display pitch used by Airplane.tsx; retain the group's prop rotation.
      anim: (m) => {
        visible(m);
        m.rotation.y = -bladeDisplayPitch(SR().s);
      },
      fitted: fiki,
    },
  );
  part(bootGeo, ["ice", "propeller"], {
    parent: "blade:" + i,
    pos: [0, 0.25, -0.005],
    color: "#2A2D31",
    name: "Grooved blade boot",
    note: "Grooved rubber anti-ice boot on the blade root; the grooves carry fluid to the blade leading edge (AMM 30-00, PDF 1168; AMM 30-60, PDF 1258; Fig. 30-60-1 item 14, PDF 1267). Two root grooves drawn for feed-tube alignment; root, groove spacing and dimensions approximate because the figure is undimensioned.",
    ext: true,
    pin: i === 0,
    pinIn: ["propeller"],
    anim: visible,
    fitted: fiki,
  });
}

/*
 * ---------- stall warning, serials with ice protection: AMM 27-31 ¶B, PDF 1032; Fig. 27-31-2, PDF 1044. It replaces
 * the electro-pneumatic inlet, line and pressure switch of ¶A (pitot.ts, fitted without FIKI); the "stallWire" flow
 * (flows.ts) is its wire path. ----------
 */
export const STALL_TRANSDUCER = toVec3(wingP(STALL_Z, 0.015, -1));
part(() => box(0.05, 0.016, 0.07), ["pitot", "ice"], {
  pos: STALL_TRANSDUCER,
  name: "Stall warning lift transducer",
  note: "Heated electro-mechanical lift transducer on the RH wing leading edge at the outboard porous panel: as angle of attack rises the stagnation point moves below it and pushes up its spring-loaded vane (AMM 27-31, PDF 1032; Fig. 27-31-2 item 1, PDF 1044). Part of the ice protection system (AMM 30-00, PDF 1166); STALL VANE HEAT breaker (POH Fig 7-11). Two mounting-plate heaters, one vane heater and one case heater (AMM 13773-002 Rev 7, 27-31 ¶B(3)(d), PDF p. 1039) controlled by the PITOT HEAT switch (¶B(2)(f), PDF p. 1038). STALL VANE HEAT feed on NON ESS BUS (POH 13772-007 Fig 7-11, 7-52; AMM 27-31 ¶B(2)(e), PDF p. 1038). Ground power 25%, airborne 100% (p. 45; ref. 13772-134 Rev 05, applicability to the modelled airplane unconfirmed). Limit ground heat operation to 45 seconds (p. 6; ref. 13772-134 Rev 05, applicability to the modelled airplane unconfirmed). Serials with ice protection (FIKI) only; replaces the pneumatic inlet (AMM 27-31 ¶A / ¶B, PDF 1032). Span position approximate.",
  ext: true,
  pin: true,
  anim: visible,
  fitted: fiki,
});
// RH rear-seat floor toward CF3R (AMM 13773-002 Rev 7 Fig 27-31-2 Detail A, PDF p. 1044;
// Fig 6-00-6, PDF p. 123). Offsets are illustrative: clear the cross-over pulley and static plumbing.
export const STALL_COMPUTER: Vec3 = [REAR_CUSHION_X + 0.2, -0.58, 0.12];
// Illustrative connector at the upper face of the 0.05 m model case (AMM Fig 27-31-2, PDF p. 1044).
export const STALL_COMPUTER_PORT: Vec3 = [STALL_COMPUTER[0], STALL_COMPUTER[1] + 0.025, STALL_COMPUTER[2]];
part(() => box(0.14, 0.05, 0.1), ["pitot", "ice"], {
  pos: STALL_COMPUTER,
  name: "Stall warning computer",
  note: "Under cabin access panel CF3R, the aft-floor access panel (AMM 27-31, PDF 1032; Fig. 27-31-2 item 4 and Detail A, PDF 1044; Fig. 6-00-6, PDF 123 labels CF3R 'Pitot-Static Water Trap'). Serials with ice protection (FIKI) only. Excites the transducer and signals the avionics for the aural warning and the STALL CAS. STALL WARNING breaker, ESS BUS 2: basic POH 2 A kept pending the FIKI supplement (POH 7-68); AMM 27-31 gives 5 A for ice-protection serials. Position approximate.",
  pin: true,
  anim: visible,
  fitted: fiki,
});
