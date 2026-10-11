/**
 * Precise Flight Built-In Oxygen System (STC SA01708SE): bottle and regulator in the empennage avionics bay, supply line,
 * overhead distribution manifold (five-place AFMS variant), control panel, and the remote filler station on the baggage compartment
 * aft wall (AMM 13773-002 Rev 7 35-00, PDF p. 1780). The AMM describes four stations and has no chapter 35 figures. AFMS §1 p. 8 supports five places.
 * The overhead distribution manifold is one compact headliner console with the integral LED dome light (AFMS 102NMAN0001 Rev F
 * §1 p. 8, Fig 1 p. 10) at the forward end of the centre-cabin line; all five mask ports sit side by side on its lower face.
 */
import type { Vec3 } from "@/lib/math";
import { Vector3 } from "three";
import { AB, box, cyl, inFus, topY, tubeGeo } from "../geometry";
import { part } from "./catalogue";
import { REAR_SEAT, STACK } from "./cabin";
import { DOME_LIGHT_RADIUS, LIGHTS } from "./lights";
import { sysNow } from "@/lib/anims";
import { mats } from "@/lib/materials";
import { OXY_CAPACITY_LABELS, oxyPanelLamps, type OxygenLamp } from "../model";
import { useSR22T } from "../store";

const HEADLINER = 0.04; // below the outer skin
/** Exact wording for every undimensioned headliner station. */
const STATIONS = "stations approximate (AFMS Fig 1 undimensioned)";
/** Local roof height at (x, z): the skin is not flat across, so `topY` (centreline) overstates it outboard. */
const roofY = (x: number, z: number) => {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (inFus(new Vector3(x, m, z))) lo = m;
    else hi = m;
  }
  return lo;
};
/**
 * Overhead console: AFMS Fig 1 "distribution manifold with integral LED dome light", so it sits on the POH 7-59 dome
 * light (`LIGHTS.dome`), whose lens is on its lower face. Forward of the CAPS cover and cabin speaker. No source
 * dimensions the console; 0.16 × 0.025 × 0.20 m is approximate, sized to carry five ports abreast plus the lens.
 */
const MANIFOLD_SIZE: Vec3 = [0.16, 0.025, 0.2];
const manifold: Vec3 = [LIGHTS.dome[0], LIGHTS.dome[1] + DOME_LIGHT_RADIUS + MANIFOLD_SIZE[1] / 2, LIGHTS.dome[2]];
/** A5 mask port: radius and protrusion below the console face approximate. */
const PORT_RADIUS = 0.012;
const PORT_LENGTH = 0.035;
/** Ports abreast at an approximate 40 mm pitch, in one row 55 mm aft of the console centre, clear of the dome lens and
 * cabin light switch; numbered 1–5 from left to right. */
export const OXY_PORT_PITCH = 0.04;
const PORT_ROW_X = manifold[0] - 0.055;
const port = (i: number): Vec3 => [
  PORT_ROW_X,
  manifold[1] - MANIFOLD_SIZE[1] / 2 - PORT_LENGTH / 2,
  manifold[2] + (i - 2) * OXY_PORT_PITCH,
];
/** Mid-roof supply waypoint over the aft occupants (FS 180, POH Fig 6-3); routing illustrative. */
const REAR_X = REAR_SEAT.referenceX;
const SUPPLY_MID: Vec3 = [REAR_X + 0.04, roofY(REAR_X + 0.04, 0.05) - HEADLINER, 0.05];
/** The supply runs forward outboard of the CAPS cover, T-handle and speaker, crossing the x 0.75 roll-cage hoop near the roof. */
const TRUNK_Z = 0.15;
const HOOP_X = 0.75;
/** Existing illustrative bottle envelope (AMM 35-00 PDF 1780 / AFMS Fig 1 p. 10), unchanged. */
export const OXY_BOTTLE_RADIUS = 0.105;
export const OXY_BOTTLE_LENGTH = 0.66;
/** Lead position rulings: preserve sourced yaw bay (AMM Fig 22-10-6 sh 3, PDF 606) and
 * physical CAPS (POH 7-95), plus rendered static lines (AMM Fig 34-10-1 sh 2, PDF 1646).
 * Fix3: lower/aft illustrative RE3 position clears both static lines and the yaw actuator;
 * accepted regulator/strap/fittings and line endpoints follow this anchor. Size/note unchanged. */
const bottle: Vec3 = [-1.33, -0.045, 0];
// Illustrative 80 mm riser keeps the regulator above the sourced yaw bay (AFMS Fig 1 p. 10).
const regulator: Vec3 = [bottle[0] + 0.37, bottle[1] + 0.08, bottle[2]];
const SUPPLY_JOIN: Vec3 = [-0.58, 0.24, 0.17];
const bottlePort: Vec3 = [bottle[0] + OXY_BOTTLE_LENGTH / 2, bottle[1], bottle[2]];
const regulatorIn: Vec3 = [regulator[0] - 0.03, regulator[1], regulator[2]];
const regulatorOut: Vec3 = [regulator[0] + 0.03, regulator[1], regulator[2]];
const hoseStart: Vec3 = [regulator[0] + 0.04, regulator[1], regulator[2]];
const fillerPort: Vec3 = [bottlePort[0], bottle[1] - 0.04, bottle[2] + 0.06];
const fillerStart: Vec3 = [fillerPort[0] + 0.006, fillerPort[1], fillerPort[2]];
export const OXY_CONNECTIONS = {
  bottlePort,
  regulatorIn,
  regulatorOut,
  hoseStart,
  fillerPort,
  fillerStart,
  supplyJoin: SUPPLY_JOIN,
};
export const OXY: {
  bottle: Vec3;
  regulator: Vec3;
  manifold: Vec3;
  panel: Vec3;
  filler: Vec3;
  outlets: Vec3[];
} = {
  bottle,
  regulator,
  manifold,
  panel: STACK.at(0.08, 0.002, -0.04),
  filler: [AB + 0.03, 0.05, 0.25],
  // Five-place AFMS §1 p. 8: five ports on the one overhead console (operator observation of the modelled airplane), left to right.
  outlets: [0, 1, 2, 3, 4].map(port),
};

/* ---------- oxygen ---------- */
part(() => cyl(OXY_BOTTLE_RADIUS, OXY_BOTTLE_LENGTH, "x"), ["oxygen"], {
  pos: OXY.bottle,
  name: "Oxygen bottle — 77 cu ft",
  note: "Empennage avionics bay (RE3), aft of the baggage bulkhead: 77 cu ft at 1800 psig (AMM 13773-002 Rev 7 35-00, PDF p. 1780; Fig 6-00-8, PDF p. 125). Fore-aft orientation from AFMS 102NMAN0001 Rev F Fig 1, p. 10. Illustrative: no bottle drawing in the AMM or AFMS. Outer radius 0.105 m, length 0.66 m; assumed internal radius 0.100 m and length 0.60 m give 18.85 L, above the ideal-gas minimum 17.7 L derived from the stated charge. Placement approximate.",
  pin: true,
});
part(() => box(0.06, 0.07, 0.07), ["oxygen"], {
  pos: OXY.regulator,
  name: "Regulator / latching solenoid",
  note: "Reduces bottle pressure to 70 psig. For serials 22T-1473 thru 9749 (the modelled airplane included), the control panel switches a latching solenoid to supply the overhead manifold (AMM 13773-002 Rev 7 35-00, PDF p. 1780). Dimensions and placement approximate.",
  pin: true,
});
part(
  () =>
    tubeGeo(
      [
        SUPPLY_JOIN,
        [AB + 0.08, 0.32, 0.17],
        [AB + 0.12, 0.46, 0.05],
        [0.2, topY(0.2) - HEADLINER, 0.05],
        SUPPLY_MID,
        [HOOP_X - 0.08, roofY(HOOP_X - 0.08, TRUNK_Z) - 0.02, TRUNK_Z],
        [HOOP_X, roofY(HOOP_X, TRUNK_Z) - 0.0125, TRUNK_Z],
        [HOOP_X + 0.08, roofY(HOOP_X + 0.08, TRUNK_Z) - 0.02, TRUNK_Z],
        [1.0, roofY(1.0, TRUNK_Z) - HEADLINER, TRUNK_Z],
        // Final bend meets the console's aft face square, inside its 0.20 m width; approximate.
        [manifold[0] - MANIFOLD_SIZE[0] / 2 - 0.015, manifold[1], 0.1],
        [manifold[0] - MANIFOLD_SIZE[0] / 2, manifold[1], 0.08],
      ],
      0.008,
    ),
  ["oxygen"],
  {
    name: "Center cabin low pressure oxygen line",
    note: `Center cabin low pressure oxygen line: from the aft non-conductive hose, up the aft cabin to the headliner, then forward along the roof to the overhead console (AFMS 102NMAN0001 Rev F Fig 1, p. 10). Regulated to 70 psig (AMM 35-00, PDF p. 1780). Routing and diameter approximate; ${STATIONS}.`,
    pin: true,
  },
);
part(() => box(...MANIFOLD_SIZE), ["oxygen"], {
  pos: OXY.manifold,
  name: "Overhead distribution manifold",
  note: `One overhead console in the headliner: "oxygen distribution manifold with integral LED dome light" at the forward end of the centre-cabin line (AFMS 102NMAN0001 Rev F §1 p. 8, Fig 1 p. 10), so it carries the cabin dome light (POH 13772-007 7-59, "in the headliner at the approximate center of the cabin"). All five mask ports sit side by side on its lower face, aft of the dome lens (operator observation of the modelled airplane). Five-place AFMS variant (§1 p. 8); A5 is the only approved flow device for the five-port manifold (§5.3 Fig 26 p. 42). AMM 35-00 PDF p. 1780 states up to four stations; five ports are the operator-observed configuration. Flow controls are calibrated and user-adjustable for altitude. Console size, port pitch and row position approximate: no source dimensions them; ${STATIONS}.`,
  pin: true,
});
OXY.outlets.forEach((p, i) =>
  part(() => cyl(PORT_RADIUS, PORT_LENGTH), ["oxygen"], {
    pos: p,
    name: `Oxygen outlet ${i + 1}`,
    note: `A5 breathing-station port ${i + 1} of 5 (left to right) on the overhead console's lower face, fed inside the manifold; every occupant plugs a mask line into this one cluster (operator observation of the modelled airplane; AFMS 102NMAN0001 Rev F §1 p. 8, Fig 1 p. 10, §5.3 Fig 26 p. 42). AMM 35-00 PDF p. 1780 states up to four stations; five ports are the operator-observed configuration. Port size, 40 mm pitch and row position approximate; ${STATIONS}.`,
    pin: true,
  }),
);
part(() => box(0.004, 0.066, 0.064), ["oxygen"], {
  pos: OXY.panel,
  rot: STACK.rot,
  color: "#20262B",
  name: "Oxygen system control panel",
  note: "Center console, immediately left of the flap switch, on the integrated flap panel (AFMS 102NMAN0001 Rev F §1 p. 8, §1.1 p. 11, Figs 1–2 p. 10; POH 13772-007 Fig 7-4 item 10, 7-14). Separate control panel applies to the modelled airplane (AMM 35-00, PDF p. 1780). 28 V through CABIN LIGHTS / OXYGEN, 5 A, MAIN BUS 1 (POH Fig 7-11, 7-52; AMM 35-00, PDF p. 1781); POH governs the older AFMS Main Bus 2 wording. Fig 2 layout assumed pending installed-panel confirmation; dimensions approximate. Single-band lamps are illustrative: Fig 2 and §1 do not define bar versus single-lamp behavior. Steady wiring FAULT not modelled.",
  pin: true,
});
part(() => box(0.03, 0.12, 0.1), ["oxygen"], {
  pos: OXY.filler,
  name: "Remote filler station",
  note: "Baggage compartment aft wall: fill port with a manual pressure gauge (AMM 35-00). Service per Precise Flight ICA 102NPMAN0003; keep oil, grease, paint, hydraulic fluid and other flammable material away from oxygen equipment (POH 8-18).",
  pin: true,
});
part(() => cyl(0.025, 0.012, "x"), ["oxygen"], {
  pos: [OXY.filler[0] + 0.02, OXY.filler[1] + 0.025, OXY.filler[2]],
  color: "#F2F2F2",
});
part(
  () =>
    tubeGeo(
      [
        fillerStart,
        [OXY.bottle[0] + OXY_BOTTLE_LENGTH / 2 + 0.02, OXY.bottle[1] - 0.04, OXY.bottle[2] + 0.06],
        [-0.76, -0.06, 0.08],
        [-0.65, 0.12, 0.08],
        [OXY.filler[0] - 0.02, OXY.filler[1], OXY.filler[2]],
      ],
      0.006,
      0,
    ),
  ["oxygen"],
  { name: "Filler line", note: "Remote filler station to the bottle (AMM 35-00). Routing approximate." },
);

// New parts append after the existing oxygen block to preserve registration order.
part(() => tubeGeo([hoseStart, [-0.665, 0.045, 0.08], [-0.61, 0.1, 0.16], SUPPLY_JOIN], 0.008), ["oxygen"], {
  name: "Non-conductive oxygen hose",
  note: "Aft-fuselage non-conductive hose for lightning protection and maintenance, between regulator and rigid supply line (AFMS 102NMAN0001 Rev F Fig 1 p. 10). The flexible line is not gas tight (§4.5 p. 39). Routing and diameter approximate.",
  color: "#484B50",
  pin: true,
});
part(() => box(0.16, 0.003, 0.012), ["oxygen"], {
  pos: [OXY.bottle[0] - OXY_BOTTLE_LENGTH / 2 - 0.08, OXY.bottle[1], OXY.bottle[2]],
  name: "Oxygen bottle ground strap",
  note: "Bottle ground strap for lightning protection (AFMS 102NMAN0001 Rev F Fig 1 p. 10). Runs aft from the bottle aft end as drawn in Fig 1. Shape, 0.16 m length and attachment position approximate.",
  color: "#B7BEC4",
  pin: true,
});
part(() => box(0.035, 0.045, 0.05), ["oxygen"], {
  pos: STACK.at(0.08, -0.075, -0.04),
  rot: STACK.rot,
  name: "Oxygen logic controller",
  note: "Display/Logic Controller in the center console behind the oxygen panel, with an output for secondary avionics indication (AFMS 102NMAN0001 Rev F §1.1 p. 11; Fig 1 p. 10). Applies to the separate-panel installation on the modelled airplane (AMM 35-00, PDF p. 1780). Dimensions and placement approximate.",
  pin: true,
  pinIn: [],
});
// AFMS Fig 2 (p. 10) lamp order; the mesh and sidebar consume the same pure state.
const lampNote =
  "AFMS 102NMAN0001 Rev F §1 pp. 8–9, §1.1.2 p. 14, Fig 2 p. 10. Single-band ladder is illustrative; bar versus single-lamp behavior is unspecified. Steady wiring FAULT not modelled.";
const lamp = (
  name: string,
  t: number,
  z: number,
  color: string,
  state: (lamps: ReturnType<typeof oxyPanelLamps>) => OxygenLamp,
) =>
  part(() => cyl(0.0025, 0.003, "x", 12), ["oxygen"], {
    pos: STACK.at(t, 0.0055, z),
    rot: STACK.rot,
    name,
    note: lampNote,
    color,
    anim: (m, time) => {
      if (sysNow() !== "overview" && sysNow() !== "oxygen") {
        m.material = mats(color).dim;
        return;
      }
      const { s, E } = useSR22T.getState();
      const mode = state(oxyPanelLamps(s, E));
      m.material =
        mode === "on" || (mode === "flash" && Math.floor(time * 2) % 2 === 0) ? mats(color).hi : mats("#303438").on;
    },
  });
OXY_CAPACITY_LABELS.forEach((label, i) =>
  lamp(
    `Oxygen capacity ${label} lamp`,
    0.104 - i * 0.008,
    -0.055,
    i === 5 ? "#F04444" : "#45CF78",
    (l) => l.capacity[i],
  ),
);
lamp("Oxygen O₂ REQ’D lamp", 0.099, -0.026, "#F4B43B", (l) => l.required);
lamp("Oxygen FAULT lamp", 0.078, -0.026, "#F04444", (l) => l.fault);

// Keep the existing regulator/hose offsets, bridging their end fittings after the lead-ruled bottle move.
// AFMS Fig 1 p. 10 shows the connected supply chain; fitting radius is illustrative.
for (const [name, start, end] of [
  ["Oxygen bottle → regulator fitting", bottlePort, regulatorIn],
  ["Oxygen regulator → hose fitting", regulatorOut, hoseStart],
  ["Oxygen bottle → filler fitting", fillerPort, fillerStart],
] as const)
  part(
    () =>
      tubeGeo(
        name === "Oxygen bottle → regulator fitting"
          ? [start, [start[0] + 0.006, start[1], start[2]], [end[0] - 0.006, end[1], end[2]], end]
          : [start, end],
        0.003,
        0,
      ),
    ["oxygen"],
    {
      name,
      note: "Anchor-derived fitting keeps the bottle/regulator/hose connected after the lead placement ruling (AFMS 102NMAN0001 Rev F Fig 1 p. 10; AMM 35-00 PDF 1780). Routing, 6 mm bottle-port stub and 3 mm radius illustrative.",
    },
  );
