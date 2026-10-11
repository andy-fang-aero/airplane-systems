/** Pitot-static and stall warning: pitot, static ports, alternate static, water traps, stall inlet, OAT sensor. */
import { mergeGeos } from "@/lib/geometry";
import { V, toVec3, type Vec3 } from "@/lib/math";
import { AB, box, cyl, fus, sph, tubeGeo, wingP } from "../geometry";
import { part, suctionAnim, STALL_Z } from "./catalogue";
import { useSR22T } from "../store";

/** Serials without ice protection only: the electro-pneumatic stall warning (AMM 27-31 ¶A, PDF 1032); FIKI airplanes use the
 * lift transducer in ice.ts (¶B). */
const pneumatic = () => !useSR22T.getState().s.equip.fiki;

/* ---------- pitot-static & stall ---------- */
/**
 * Pitot mast: "an 'L' shaped mast with integral pitot tube and heater located on the LH wing just inboard of the wing tip"
 * (AMM 34-10, PDF p. 1628). The span station is not dimensioned: the last bay before the tip rounding (|z| 5.55), position
 * approximate. Chord station approximate (bracket through the lower skin beside a wing rib, AMM Fig 34-10-1 sheet 4
 * Detail E, PDF p. 1648).
 */
export const PITOT_Z = -5.2;
export const pitotBase = wingP(PITOT_Z, 0.3, -1);
/** Entry tip to the bend: 3.6 in (91.4 mm) (AMM Fig 34-10-2, PDF p. 1649). */
export const PITOT_TIP_LEN = 3.6 * 0.0254;
/** Drop from the lower skin to the tip axis, from the Fig 34-10-2 proportion (vertical leg about as long as the tip leg);
 * approximate. The bend radius is a display choice. */
const MAST_DROP = 0.1,
  BEND_R = 0.025;
/** The forward tip leg, from the bend to the entry tip (+x). */
export const PITOT_TIP: Record<"bend" | "entry", Vec3> = {
  bend: [pitotBase.x + BEND_R, pitotBase.y - MAST_DROP, PITOT_Z],
  entry: [pitotBase.x + BEND_R + PITOT_TIP_LEN, pitotBase.y - MAST_DROP, PITOT_Z],
};
part(
  () => {
    const [bx, by] = PITOT_TIP.bend,
      k = BEND_R * (1 - Math.SQRT1_2);
    const housing = box(0.07, 0.03, 0.014).translate(pitotBase.x + 0.01, pitotBase.y - 0.015, PITOT_Z);
    const leg = tubeGeo(
      [pitotBase, [pitotBase.x, by + BEND_R, PITOT_Z], [bx - BEND_R + k, by + k, PITOT_Z], PITOT_TIP.bend],
      0.011,
      0.05,
    );
    return mergeGeos([housing, leg]);
  },
  ["pitot"],
  {
    name: "Pitot mast",
    note: 'Single heated pitot, LH wing (POH 7-68): an "L" shaped mast with integral pitot tube and heater, just inboard of the wing tip (AMM 34-10, PDF p. 1628). The mast housing holds the heater and plug; its bracket passes through the lower wing skin beside a wing rib, with a ground strap (AMM Fig 34-10-2 note 7, PDF p. 1649; Fig 34-10-1 sheet 4 Detail E, PDF p. 1648). Span station and mast height are not dimensioned; position approximate.',
    ext: true,
  },
);
part(() => cyl(0.011, PITOT_TIP_LEN, "x"), ["pitot"], {
  pos: [PITOT_TIP.bend[0] + PITOT_TIP_LEN / 2, PITOT_TIP.bend[1], PITOT_Z],
  name: "Heated pitot tube",
  note: "Forward tip: 3.6 in (91.4 mm) from the entry tip to the bend, with a lower forward drain hole 1.1 in (27.9 mm) aft of the tip and an upper aft drain hole (AMM Fig 34-10-2, PDF p. 1649). Element heated when PITOT HEAT is on (POH 7-68). 7.5 A PITOT HEAT breaker on NON-ESSENTIAL BUS; a current sensor on the heater supply wire drives PITOT HEAT FAIL (POH 7-68, 7-69).",
  pin: true,
  ext: true,
});
/** Static ports, "on the LH and RH sides of the fuselage behind the aft cabin bulkhead" (AMM 34-10, PDF p. 1629); the
 * station is not dimensioned, FS ≈ 266 approximate. */
export const SPX = -1.6;
export const statR = fus(SPX);
[1, -1].forEach((s) =>
  part(() => cyl(0.025, 0.006, "z"), ["pitot"], {
    pos: [SPX, statR.cy, s * statR.hw],
    color: "#3A9448",
    name: "Static port (" + (s > 0 ? "R" : "L") + ")",
    note: "Dual static ports in the fuselage (POH 7-68), on the LH and RH sides behind the aft cabin bulkhead (AMM 34-10, PDF p. 1629). Station approximate.",
    pin: s > 0,
    ext: true,
  }),
);
/** Alternate static source valve: switch and control panel, right of the pilot's leg (POH 7-69). */
export const ALT_STATIC: Vec3 = [1.84, -0.3, -0.14];
part(() => box(0.05, 0.05, 0.03), ["pitot"], {
  pos: ALT_STATIC,
  color: "#3A9448",
  name: "Alternate static valve",
  note: "Switch and control panel, right of the pilot's leg (POH 7-69); the AMM puts it on the lower LH side of the console, teed into the static tube (AMM 34-10, PDF p. 1629; Fig 34-10-1 sheet 4 Detail D, PDF p. 1648). Supplies static pressure from inside the cabin; apply the Section 5 airspeed and altitude corrections.",
  pin: true,
});
/**
 * Water traps "with drains, under the floor in the cabin, … at each Pitot and static line low point" (POH 7-68). The AMM text
 * puts both under access panel CF2L (AMM 34-10, PDF pp. 1629, 1636) and Fig 6-00-6 labels CF3R "Pitot-Static Water Trap"
 * (PDF p. 123): open question Q7. Both placed provisionally under CF3R, right of centre and aft of the spar
 * tunnel, staggered so both read in the pitot view; positions approximate.
 */
export const TRAPS: Record<"pitot" | "static", Vec3> = {
  pitot: [0.97, -0.625, 0.24],
  static: [1.13, -0.625, 0.33],
};
const TRAP_SIZE = 0.05;
const trapNote = (line: "pitot" | "static") =>
  `Water trap at the ${line} line low point, with a drain tube and plug; drain at the annual inspection and when water is known or suspected (POH 7-68; AMM Fig 34-10-1 items 4, 8, PDF p. 1646). Position pending Q7: placed under CF3R ("Pitot-Static Water Trap", AMM Fig 6-00-6, PDF p. 123); the AMM text puts the ${line} trap under CF2L, the pilot seat panel (AMM 34-10, PDF p. ${line === "pitot" ? 1636 : 1629})${line === "static" ? "; its Static System Plumbing section says CF3L and adds a second static trap and plug forward of the alternate static valve (PDF p. 1639)" : ""}.`;
part(() => box(TRAP_SIZE, TRAP_SIZE, TRAP_SIZE), ["pitot"], {
  pos: TRAPS.pitot,
  color: "#3A9448",
  name: "Pitot water trap",
  note: trapNote("pitot"),
  pin: true,
});
part(() => sph(0.025), ["pitot"], {
  pos: toVec3(wingP(STALL_Z, 0, 0)),
  color: "#3A9448",
  name: "Stall warning inlet",
  note: "Right wing leading edge. Sucks as the low-pressure peak moves forward near stall → pressure switch → horn, red STALL, autopilot disconnect (POH 7-68). Serials without ice protection only (AMM 27-31 ¶A, PDF 1032); FIKI airplanes use a lift transducer.",
  pin: true,
  ext: true,
  fitted: pneumatic,
});
part(() => sph(0.04), ["pitot"], {
  pos: toVec3(wingP(STALL_Z, 0.3, 1)),
  color: "#E0263B",
  anim: suctionAnim,
  name: "Low-pressure peak",
  note: "Moves forward around the leading edge as angle of attack increases.",
  ext: true,
});
/** Anchor for flows.ts. */
export const STALL_SWITCH: Vec3 = [1.4, -0.45, -0.11];
part(() => box(0.04, 0.03, 0.025), ["pitot"], {
  pos: STALL_SWITCH,
  color: "#3A9448",
  name: "Stall warning pressure switch",
  note: "Normally open, diaphragm-operated switch on the mid-console LH side panel; senses the inlet's negative pressure and signals the avionics for the horn and STALL (POH 7-68; AMM 27-31 ¶A, PDF 1032). Serials without ice protection only. Position approximate.",
  pin: true,
  fitted: pneumatic,
});
// Both RH probes: operator observation of the modelled airplane, plus AMM Fig 34-10-6 (PDF p. 1666).
// The 100 mm side-by-side span spacing is illustrative, not dimensioned by the AMM. Both stations sit just outboard of the
// fuel tank's outboard end (span 4.5, parts/fuel.ts) so the probe bases clear the tank volume.
export const OAT_1: Vec3 = toVec3(wingP(4.52, 0.45, -1));
export const OAT_2: Vec3 = toVec3(wingP(4.62, 0.45, -1));
([OAT_1, OAT_2] as const).forEach((pos, i) =>
  part(
    () =>
      tubeGeo(
        [
          [0, 0.01, 0],
          [0.01, -0.07, 0],
        ],
        0.006,
      ),
    ["pitot", "avionics"],
    {
      pos,
      color: "#8C959C",
      name: `OAT sensor ${i + 1}`,
      note: `Outside-air-temperature probe connected directly to ADAHRS ${i + 1}'s ADC (POH 7-75; selected-side OAT 7-80/7-81). Both probes on the RH wing: operator observation of the modelled airplane, plus AMM Fig 34-10-6 (PDF p. 1666; RW12 access panel, AMM 34-10 PDF p. 1665). Position and side-by-side spacing approximate.`,
      ext: true,
      pin: true,
    },
  ),
);
part(() => box(TRAP_SIZE, TRAP_SIZE, TRAP_SIZE), ["pitot"], {
  pos: TRAPS.static,
  color: "#3A9448",
  name: "Static water trap",
  note: trapNote("static"),
  pin: true,
});
/** Static line sumps, "mounted directly to the ports" (AMM 34-10, PDF p. 1629; Fig 34-10-1 item 16, PDF p. 1646). */
export const SUMPS: Vec3[] = [1, -1].map((s) => [SPX, statR.cy - 0.03, s * (statR.hw - 0.035)]);
SUMPS.forEach((p, i) =>
  part(() => cyl(0.012, 0.05, "y"), ["pitot"], {
    pos: p,
    color: "#3A9448",
    name: "Static line sump (" + (i === 0 ? "R" : "L") + ")",
    note: "Mounted directly to the static port, in line between the port and the static tube; gives more resistance to forced water intrusion (AMM 34-10, PDF pp. 1629, 1639; Fig 34-10-1 sheet 2 items 13, 16, 2, PDF p. 1646). Size approximate.",
    pin: i === 1,
  }),
);
/** Static tee on the aft cabin bulkhead, at the LH CAPS enclosure (AMM 34-10, PDF p. 1629; Fig 34-10-1 note 2, PDF p.
 * 1646); height approximate. */
export const STATIC_TEE: Vec3 = [AB - 0.03, 0.15, -0.17];
part(() => cyl(0.03, 0.006, "z"), ["pitot"], {
  pos: [ALT_STATIC[0], ALT_STATIC[1], ALT_STATIC[2] - 0.018],
  color: "#2B2B2B",
  name: "Alternate static knob",
  note: "Valve knob on the console (AMM Fig 34-10-1 sheet 4 Detail D item 19, PDF p. 1648). Open it if water or ice in the static line is suspected (POH 7-69).",
});
// Heater wiring (POH Fig 7-16): 7.5 A PITOT HEAT breaker → current sensor → mast heater; routing approximate, no particles.
const HEAT_SENSOR: Vec3 = [1.72, -0.5, -0.2];
part(() => box(0.03, 0.02, 0.02), ["pitot"], {
  pos: HEAT_SENSOR,
  color: "#8C959C",
  name: "Pitot heat current sensor",
  note: "On the pitot heater power supply wire; no current with PITOT HEAT on gives PITOT HEAT FAIL (POH 7-69; Fig 7-16). Position approximate: the figure is a schematic.",
});
part(
  () =>
    tubeGeo(
      [
        [1.78, -0.42, -0.16],
        HEAT_SENSOR,
        // Approximate under-valve bend: AMM Fig 30-07-2 sheet 4 Detail C (PDF 1220);
        // POH 13772-007 Fig 7-16 (7-71) does not dimension the heater wire route.
        [1.69, -0.6, -0.24],
        [1.5, -0.6, -0.3],
        // Forward of the TKS tank lateral rib; 25 mm above the mid-plane to clear both TKS feeds.
        // Approximate display offset: POH 13772-007 Fig 7-16 / 7-68–7-69 and AMM 13773-002 Rev 7
        // 34-10 PDF 1628 / Fig 34-10-1 PDF 1648 do not dimension the wire route.
        wingP(-0.6, 0.06, 0).add(V(0, 0.025, 0)),
        wingP(-1.3, 0.06, 0).add(V(0, 0.025, 0)),
        wingP(-1.8, 0.24, 0),
        // Approximate detour around the spar tip, then an aft lower-skin approach (AMM 13773-002 Rev 7
        // Fig 34-10-1 sheet 4 Detail E, PDF 1648); no documented spar pass-through is assumed.
        wingP(PITOT_Z - 0.18, 0.24, 0),
        wingP(PITOT_Z - 0.18, 0.36, 0),
        wingP(PITOT_Z, 0.36, -1).add(V(0, 0.012, 0)),
        // Approximate final approach angle at the fixed mast endpoint (AMM Fig 34-10-1 Detail E, PDF 1648).
        pitotBase.clone().add(V(-0.025, 0.004, 0)),
        pitotBase.clone().add(V(-0.02, 0.012, 0)),
      ],
      0.004,
    ),
  ["pitot"],
  {
    color: "#D9960F",
    name: "Pitot heater wiring",
    note: "PITOT HEAT breaker (7.5 A, NON-ESSENTIAL BUS) through the current sensor to the mast heater; the PITOT HEAT switch and logic report to the Engine Airframe Unit (POH 13772-007 7-68, 7-69; Fig 7-16, 7-71). Routing approximate: the POH and AMM 13773-002 Rev 7 34-10 (PDF 1628; Fig 34-10-1, PDF 1648) do not dimension this run; the leading-edge bay wire is raised 25 mm above the wing mid-plane for display clearance from the TKS feed lines (AMM 30-00, PDF 1167–1168; Fig 30-07-2, PDF 1220–1223), not an aircraft routing dimension. The cabin bend runs below the TKS 3-way valve (AMM Fig 30-07-2 sheet 4 Detail C, PDF 1220) and the mast approach rounds the outboard end of the main spar, returning aft and low to the mast (AMM Fig 34-10-1 sheet 4 Detail E, PDF 1648); these undimensioned offsets are approximate display choices, keeping at least 2 mm surface clearance, not a documented spar passage.",
  },
);
part(() => box(0.03, 0.004, 0.012), ["pitot"], {
  pos: [pitotBase.x + 0.03, pitotBase.y + 0.012, PITOT_Z],
  color: "#8C959C",
  name: "Pitot mast ground strap",
  note: "Bonds the mast bracket to the wing (AMM Fig 34-10-1 sheet 4 Detail E, PDF p. 1648). Size approximate.",
});
/**
 * Trap drains: each trap drains through a drain tube to a fitting and plug (AMM Fig 34-10-1 sheet 2 items 8 Drain Tube,
 * 5 Fitting, 4 Plug, PDF p. 1646; "A water trap and plug", AMM 34-10, PDF p. 1636; "Water traps with drains", POH 7-68).
 * Each tube leaves the bottom of its trap and ends at its plug; routing and length approximate, positions pending Q7.
 */
const drain = (t: Vec3, plug: Vec3) => {
  const top: Vec3 = [t[0], t[1] - TRAP_SIZE / 2, t[2]];
  const tube: Vec3[] = [top, [t[0], top[1] - 0.012, t[2]], [(t[0] + plug[0]) / 2, plug[1], (t[2] + plug[2]) / 2], plug];
  return { tube, plug };
};
export const DRAINS: Record<"pitot" | "static", { tube: Vec3[]; plug: Vec3 }> = {
  pitot: drain(TRAPS.pitot, [0.85, -0.662, 0.18]),
  static: drain(TRAPS.static, [1.03, -0.662, 0.29]),
};
(["pitot", "static"] as const).forEach((line) => {
  const Line = line === "pitot" ? "Pitot" : "Static";
  part(() => tubeGeo(DRAINS[line].tube, 0.005), ["pitot"], {
    color: "#8C959C",
    name: `${Line} drain tube`,
    note: `Drain tube from the ${line} water trap to its fitting and plug (AMM Fig 34-10-1 sheet 2 items 8, 5, PDF p. 1646; POH 7-68). Routing and length approximate; position pending Q7 with the trap.`,
  });
  part(() => cyl(0.011, 0.022, "x"), ["pitot"], {
    pos: DRAINS[line].plug,
    color: "#D9960F",
    name: `${Line} drain plug`,
    note: `Remove to drain the ${line} water trap at the annual inspection and when water is known or suspected (POH 7-68; AMM 34-10, PDF p. 1636; Fig 34-10-1 item 4, PDF p. 1646). Placed under CF3R (AMM Fig 6-00-6, PDF p. 123); the AMM text puts the ${line} trap and plug under CF2L (PDF p. ${line === "pitot" ? 1636 : 1629}): position pending Q7.`,
    pin: true,
  });
});
