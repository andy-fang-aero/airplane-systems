/** Fuel system hardware (the tanks are rendered separately). */
import { mergeGeos } from "@/lib/geometry";
import { V, toVec3, type Vec3 } from "@/lib/math";
import { FW, botY, box, cyl, loft, sph, tubeGeo, wingP, wingSec } from "../geometry";
import { part, sided } from "./catalogue";
import { CYL_CENTER_X } from "./engine";
import { INTAKE_MANIFOLD, INTAKE_MANIFOLD_PATH, INTAKE_MANIFOLD_R } from "./engine-air";

/** AMM 13773-002 Rev 7 28-10, PDF p. 1088: spar to aft shear web, between fuel ribs.
 * Span/rib stations and 60% aft-web chord are approximate (Fig 6-00-7, PDF p. 124).
 * Forward chord matches the model's main spar (structure.ts), not a dimensioned manual station. */
export const TANK_SPAN = [0.95, 4.5] as const;
export const TANK_CHORD = [0.3, 0.6] as const;
/** Top inboard return entry (AMM 28-10, PDF p. 1088); station approximate. On the tank's top skin, which
 * Airplane.tsx lofts at 0.85 of the wing thickness about the mean line: wingP's `up` is only a side, so
 * wingP(…, 0.85) put the entry on the outer upper skin and the 9 mm return tube broke through it. */
export const tankTop = (s: number) => {
  const mean = wingP(s * TANK_SPAN[0], 0.45, 0);
  return mean.clone().lerp(wingP(s * TANK_SPAN[0], 0.45, 1), 0.85);
};

/* ---------- fuel system hardware (tanks are rendered separately) ---------- */
/** Anchors for flows.ts. */
export const COLLECTOR = (s: number) => toVec3(wingP(s * 0.72, 0.45, 0));
export const NACA_FUEL_VENT = (s: number) => toVec3(wingP(s * 5.1, 0.45, -1).add(V(0, -0.006, 0)));
[1, -1].forEach((s) => {
  part(() => box(0.2, 0.07, 0.16), ["fuel"], {
    pos: COLLECTOR(s),
    name: (s > 0 ? "Right" : "Left") + " collector tank / sump",
    note: "Tank fuel gravity-feeds through strainers and a flapper valve into the collector. Flush drain and top vent to the associated tank (POH 13772-007 7-40, Fig 7-8, 7-42; AMM 28-10, PDF pp. 1088–1089, Fig 28-10-3, PDF p. 1105). Root placement and box dimensions approximate. Approximately 2.8 gal each (AMM 13773-002 Rev 7 28-10, PDF p. 1088).",
  });
  part(() => box(0.08, 0.012, 0.12), ["fuel"], {
    pos: NACA_FUEL_VENT(s),
    color: "#2F7FE6",
    name: "NACA fuel vent",
    note: "Lower-wing outboard NACA access panel LW10/RW10 (AMM 13773-002 Rev 7 Fig 6-00-7, PDF p. 124; Fig 28-10-3, PDF p. 1105); span station and dimensions approximate. Under the wing near the tip. A blocked vent starves the engine — check it preflight (POH 13772-007 7-40).",
    ext: true,
  });
  part(() => sph(0.025), ["fuel"], {
    pos: toVec3(wingP(s * 1.3, 0.45, -1)),
    color: "#0B3A80",
    name: "Tank drain",
    note: "At the inboard fuel-tank access panel; placement and dimensions approximate (AMM 13773-002 Rev 7 28-10, PDF p. 1089, Fig 28-10-4, PDF p. 1110). One of 5 drains: 2 tank, 2 collector, 1 gascolator. Sample before every flight (POH 13772-007 7-40, Fig 7-8).",
    ext: true,
  });
  part(() => cyl(0.045, 0.012), ["fuel"], {
    pos: toVec3(wingP(s * 2.7, 0.38, 1)),
    color: "#2F7FE6",
    name: "Filler cap",
    note: "Forward slope of each wing; filling to the tab = 30 gal usable per side (placard: 46 gal total usable capacity / 30 usable to tab; POH 13772-007 2-25, 7-40, 8-15). Viton o-ring; grounded through an approximately 100 ohm resistive connection (AMM 13773-002 Rev 7 28-10, PDF p. 1088).",
    ext: true,
  });
  // Append the storage details after the existing wing parts; registration order sets label ownership.
  part(() => cyl(0.025, 0.012), ["fuel"], {
    pos: toVec3(wingP(s * 0.72, 0.45, -1)),
    name: "Collector drain",
    note: "Flush drain in the lower-skin collector access panel at the collector low point. One of 5 drains: 2 tank, 2 collector, 1 gascolator (POH 13772-007 7-40, Fig 7-8, 7-42; AMM 13773-002 Rev 7 28-10, PDF p. 1089, Fig 28-10-4, PDF p. 1110). The drain valve is nutted to wing access panel LW3/RW3, Fuel Tank, Root (AMM 13773-002 Rev 7 28-10, PDF pp. 1107–1108; Fig 6-00-7, PDF p. 124). Position and dimensions approximate.",
    ext: true,
    // The left drain carries the label, so the right one leaves the flapper and inboard-sensor labels clear.
    pin: s < 0,
  });
  [0.37, 0.53].forEach((chord, i) =>
    part(() => cyl(0.022, 0.075, "z"), ["fuel"], {
      pos: toVec3(wingP(s * TANK_SPAN[0], chord, 0)),
      name: "Tank outlet strainer",
      note: "1/16-inch mesh strainer at each of two inboard-rib ports (AMM 13773-002 Rev 7 28-10, PDF p. 1088; Fig 28-10-3 item 4, PDF p. 1105). Geometry and port spacing approximate.",
      pin: i === 0 && s < 0,
    }),
  );
  part(() => cyl(0.026, 0.06, "z"), ["fuel"], {
    pos: toVec3(wingP(s * 0.84, 0.45, 0)),
    name: "Flapper valve",
    note: "Flapper valve between the tank and collector retains collector fuel during uncoordinated maneuvers (POH 13772-007 7-40, Fig 7-8, 7-42; AMM 13773-002 Rev 7 28-10, PDF p. 1088). Position and dimensions approximate.",
    pin: true,
  });
  [2.1, 3.3].forEach((z, i) =>
    part(
      () => {
        const center = wingP(s * z, 0.45, 0);
        const sections = [z - 0.008, z + 0.008].map((az) =>
          wingSec(s * az, ...TANK_CHORD, 0.8).map((p) => p.sub(center)),
        );
        return loft(sided(sections, s));
      },
      ["fuel"],
      {
        pos: toVec3(wingP(s * z, 0.45, 0)),
        name: "Fuel baffle rib",
        note: "Two integral baffle ribs per tank reduce fuel slosh (AMM 13773-002 Rev 7 28-10, PDF p. 1088; Fig 28-10-3, PDF p. 1105). Spacing, thickness and solid rib shape approximate; openings omitted.",
        plate: true,
        pin: i === 0,
      },
    ),
  );
  TANK_SPAN.forEach((z, i) => {
    const inward = i === 0 ? s : -s;
    part(
      () => {
        // Rib-mounted sender, bent float arm and float: Fig 28-40-2, PDF p. 1150; dimensions illustrative.
        const pieces = [
          cyl(0.035, 0.015, "z"),
          tubeGeo([V(0, 0, 0), V(0, -0.035, inward * 0.07), V(0.06, -0.035, inward * 0.16)], 0.005),
          cyl(0.018, 0.06, "x").translate(0.06, -0.035, inward * 0.16),
        ];
        const geo = mergeGeos(pieces);
        pieces.forEach((g) => g.dispose());
        return geo;
      },
      ["fuel"],
      {
        pos: toVec3(wingP(s * z, 0.48, 0)),
        name: i === 0 ? "Fuel quantity sensor (inboard)" : "Fuel quantity sensor (outboard)",
        note:
          "Float-type sender on the " +
          (i === 0 ? "inboard" : "outboard") +
          " fuel rib; two sensors per tank. Signal to GEA 71; 5 A FUEL QTY breaker on MAIN BUS 1 (POH 13772-007 7-40, 7-43, 7-94; AMM 13773-002 Rev 7 28-40, PDF p. 1138, Fig 28-40-2, PDF p. 1150). AMM 28-40 says 3 A FUEL QTY (or FUEL/IPS QTY); POH governs. Rib stations, arm pose and dimensions approximate.",
        // Left side: the right wing tip is clipped in the default fuel camera, and the right inboard label would sit
        // under the Flapper valve's. The fuel label priority (catalogue.ts) lets it beat the strainer's.
        pin: s < 0,
      },
    );
  });
});
/** Anchor for flows.ts. */
export const FUEL_PUMP: Vec3 = [2.67, -0.43, 0.22];
export const GASCOLATOR: Vec3 = [2.7, -0.52, 0.08];
export const ENGINE_PUMP: Vec3 = [2.8, -0.3, -0.12];
/** Fuel manifold valve drum: a squat round body on top of the induction manifold at engine centre, the injector lines
 * radiating from it (AMM 13773-002 Rev 7 Fig 71-00-2 sheet 1 item 4, PDF p. 2487; Continental M-18 Fig 12-10 item 4,
 * p. 12-15). Radius, height and the gap above the manifold are illustrative; neither figure dimensions the valve. */
export const SPIDER_R = 0.035;
export const SPIDER_H = 0.05;
const SPIDER_GAP = 0.006;
/** Seated on the manifold tube's highest drawn surface, so it follows the manifold when the induction is reshaped. */
export const SPIDER: Vec3 = [
  CYL_CENTER_X,
  Math.max(...INTAKE_MANIFOLD_PATH.map((p) => p[1])) + INTAKE_MANIFOLD_R + SPIDER_GAP + SPIDER_H / 2,
  INTAKE_MANIFOLD[2],
];
/** Ports on the drum, for flows.ts: the injector outlets ring its lower side and the supply enters its right side
 * (Continental M-18 Fig 12-10 inset, "FUEL INLET" / "FUEL OUTLET", p. 12-15). Heights illustrative. */
const SPIDER_OUTLET_DY = -0.012;
export const spiderOutlet = (x: number, s: number): Vec3 => {
  const dx = x - SPIDER[0],
    dz = s * 0.07,
    k = SPIDER_R / Math.hypot(dx, dz);
  return [SPIDER[0] + dx * k, SPIDER[1] + SPIDER_OUTLET_DY, SPIDER[2] + dz * k];
};
const SPIDER_INLET_Z = 0.03;
export const SPIDER_INLET: Vec3 = [
  SPIDER[0] + Math.sqrt(SPIDER_R ** 2 - SPIDER_INLET_Z ** 2),
  SPIDER[1] - 0.013,
  SPIDER[2] + SPIDER_INLET_Z,
];
/** Drain fitting low on the drum's aft face (AMM 13773-002 Rev 7 28-20, PDF p. 1113). */
export const SPIDER_DRAIN_PORT: Vec3 = [SPIDER[0] - SPIDER_R, SPIDER[1] - SPIDER_H / 2 + 0.008, SPIDER[2]];
/** Right-side fuel flow transducer: POH 13772-007 7-43; AMM 73-30 PDF 2594.
 * Illustrative station, lowered 0.20 m to clear the corrected right cylinder bank;
 * exact transducer coordinates are not dimensioned by those sources. */
export const FUEL_FLOW: Vec3 = [2.96, -0.32, 0.28];
part(() => box(0.1, 0.08, 0.1), ["fuel"], {
  pos: FUEL_PUMP,
  name: "Electric fuel pump",
  note: "Two-speed. BOOST: low speed, continuous 4–6 psi for vapor suppression. HIGH BOOST/PRIME: high speed for priming and high-altitude vapor suppression, held to low speed unless MAP ≥ 24 inHg and PA ≥ 10,000 ft, or RPM < 500 (software 2647.M4 or later). 5 A FUEL PUMP, MAIN BUS 2 (POH 13772-007 7-41). Forward of firewall (AMM 13773-002 Rev 7 28-20, PDF p. 1112; Fig 71-00-2 sheet 3 item 24, PDF p. 2489); position and dimensions approximate. FUEL RELAY shown in POH Fig 7-8 (7-42); no physical location specified, so not separately placed. Not a complete engine-driven pump backup (POH 3-24).",
  pin: true,
});
part(() => cyl(0.045, 0.1), ["fuel"], {
  pos: GASCOLATOR,
  name: "Gascolator",
  note: "Filter/sump ahead of the firewall, after the electric pump (AMM 13773-002 Rev 7 28-20, PDF p. 1112). 100–140 micron filtration; 4.9 fluid ounce bowl (AMM 28-20, PDF p. 1112, Fig 28-20-1, PDF p. 1116). Drain preflight (POH 13772-007 7-40). Position and dimensions approximate.",
  pin: true,
});
part(() => cyl(0.045, 0.09, "x"), ["fuel", "engine"], {
  pos: ENGINE_PUMP,
  name: "Engine-driven fuel pump",
  note: "On the left aft side of the engine (AMM 13773-002 Rev 7 28-20, PDF p. 1112); Fig 71-00-2 sheet 3 (item 31, PDF p. 2489) shows it inboard of the oil filter; position and dimensions approximate; integral mixture control valve and aneroid sensing upper-deck pressure (POH 13772-007 7-38; AMM 13773-002 Rev 7 73-00, PDF p. 2582). Excess fuel returns to the selected tank (POH 7-40, Fig 7-8).",
  groups: ["fuel"],
});
part(() => cyl(SPIDER_R, SPIDER_H), ["fuel", "engine"], {
  pos: SPIDER,
  name: "Fuel manifold valve (“spider”)",
  note: "Distributes metered fuel to six injector nozzles (POH 13772-007 7-38); opens at approximately 3.5 psi (AMM 13773-002 Rev 7 73-00, PDF p. 2582). Round body on top of the induction manifold at engine centre, injector lines radiating to each bank (AMM Fig 71-00-2 sheet 1 item 4, PDF p. 2487; Continental M-18 Fig 12-10 item 4, p. 12-15). Size and exact position approximate.",
  pin: true,
  groups: ["fuel"],
});
part(() => cyl(0.025, 0.07, "x"), ["fuel", "engine"], {
  pos: FUEL_FLOW,
  name: "Fuel flow transducer",
  note: "Right side of the engine, between the engine-driven pump and distribution block (POH 13772-007 7-43; position approximate). AMM 13773-002 Rev 7 73-30 (PDF p. 2594) says aft baffle to throttle metering valve; 28-40 (PDF p. 1138) says metering valve to manifold. POH governs.",
  pin: true,
  groups: ["sensors"],
});

// Fuel distribution additions. Keep existing registration order above.
part(() => box(0.18, 0.16, 0.18), ["fuel"], {
  pos: [1.24, -0.36, 0],
  name: "Selector valve enclosure",
  note: "Vented and drained enclosure isolates the selector body below the console from cabin leakage (AMM 13773-002 Rev 7 28-00, PDF p. 1078; 28-20, PDF p. 1113, Fig 28-20-3, PDF p. 1131). Position and box dimensions approximate; handle remains above the enclosure.",
  fairing: true,
  pin: true,
});
part(() => box(0.05, 0.14, 0.18), ["fuel"], {
  pos: [FW - 0.035, -0.6, 0.15],
  name: "Firewall fuel enclosure",
  note: "Aft-side firewall enclosure keeps fuel from cabin fittings out of the cabin; fittings are vented and drained (AMM 13773-002 Rev 7 28-00, PDF p. 1078; 28-20, PDF p. 1113, Fig 28-20-3 item 10, PDF p. 1131). Position and box dimensions approximate, centred on the schematic supply crossing.",
  fairing: true,
  pin: true,
});
/** Bottom-centre firewall drain cluster, attached to the engine mount inside the cowl
 * (AMM 13773-002 Rev 7 28-20, PDF p. 1113; 71-70, PDF p. 2564;
 * Fig 71-70-2 item 6 / detail A item 12, PDF p. 2565).
 * Coordinates approximate: the figures are undimensioned. Keep the existing schematic
 * bodies above the POH 13772-007 Fig 1-1 (p. 1-4) cowl loft, with only the preflight
 * valve projecting through it (POH 8-17; Fig 7-8, p. 7-42). The 8 mm centre offset
 * below the loft is an illustrative short stub, not a measured installation dimension. */
export const DRAIN_MANIFOLD: Vec3 = [FW + 0.07, -0.595, 0];
export const GASCOLATOR_DRAIN: Vec3 = [FW + 0.07, botY(FW + 0.07) - 0.008, 0];
export const CYL_DRAIN_CHECK: Vec3 = [FW + 0.07, -0.625, -0.05];
part(() => cyl(0.025, 0.12), ["fuel", "engine"], {
  pos: DRAIN_MANIFOLD,
  name: "Drain manifold",
  note: "Bottom centre of the firewall: receives auxiliary-pump, gascolator, engine-driven-pump, injection-manifold and cylinder-head drains (AMM 13773-002 Rev 7 28-20, PDF p. 1113; Fig 71-70-2 item 6, PDF p. 2565). Attached to the engine mount inside the lower cowl (AMM 71-70, PDF p. 2564). Position and dimensions approximate: figures are undimensioned; only drain exits reach the skin. Dry drain hoses are static, not fuel feeds.",
  pin: true,
  groups: ["fuel"],
});
part(() => cyl(0.013, 0.025), ["fuel"], {
  pos: GASCOLATOR_DRAIN,
  name: "Gascolator drain",
  note: "Bowl drain tube leads to the preflight drain valve at the drain manifold (AMM 13773-002 Rev 7 28-20, PDF p. 1112; Fig 28-20-1 items 7–11, PDF p. 1116). One of 5 fuel drains; exits the lower engine cowl just forward of the firewall near the centreline (POH 13772-007 7-40, Fig 7-8, 7-42; 8-17). Short external valve stub at the POH Fig 1-1 (1-4) loft skin; position and dimensions approximate because the drain figures are undimensioned.",
  ext: true,
  pin: true,
});
/** Hung below the valve, beside the induction manifold and under the injector-line fan; offsets illustrative. */
export const FUEL_PRESSURE_SWITCH: Vec3 = [
  SPIDER[0] - 0.09,
  INTAKE_MANIFOLD[1] - 0.02,
  SPIDER[2] + (INTAKE_MANIFOLD_R + 0.026),
];
part(() => cyl(0.018, 0.045), ["fuel", "engine"], {
  pos: FUEL_PRESSURE_SWITCH,
  name: "Fuel pressure switch",
  note: "Mounted below the injector manifold (POH 13772-007 Fig 7-8, 7-42; AMM 13773-002 Rev 7 Fig 28-00-3 sheet 1, PDF p. 1086). Position and dimensions approximate; operating threshold and annunciation function are not specified in this schematic.",
  pin: true,
  groups: ["sensors"],
});
part(() => cyl(0.018, 0.06), ["fuel", "engine"], {
  pos: CYL_DRAIN_CHECK,
  name: "Cylinder drain manifold check valve",
  note: "Cylinder-head drains join a manifold with a check valve at the firewall drain-manifold base, beside the drain manifold and drain valve. It closes when manifold pressure is below ambient pressure to prevent loss of manifold pressure (AMM 13773-002 Rev 7 28-20, PDF p. 1113; Fig 71-70-2 detail A item 12, PDF p. 2565). Inside the lower cowl beside the manifold base. Position and dimensions approximate because the figure is undimensioned; static dry drain plumbing.",
  groups: ["fuel"],
});
