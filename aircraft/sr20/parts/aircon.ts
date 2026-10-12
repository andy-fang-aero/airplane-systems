/** Optional SR20 G6 A/C: POH 11934-005 7-62–67; AMM 12137-002 RA/A1 21-50.
 * The installation is a study configuration, not confirmation that the photographed airframe has A/C.
 * Sizes, belt proportions and hose stations are schematic; no SR22T accessory drive is reused. */
import * as THREE from "three";
import { mergeGeos } from "@/lib/geometry";
import type { Vec3 } from "@/lib/math";
import { FUSE, box, cyl, tubeGeo } from "../geometry";
import { cabinOperation } from "../environment";
import { useSR20 } from "../store";
import { part } from "./catalogue";
import { BLOWER } from "./environment";

export const AC: Record<
  | "compressor"
  | "condenser"
  | "receiver"
  | "expansion"
  | "evaporator"
  | "recircValve"
  | "recircInlet"
  | "condenserFan"
  | "intake"
  | "exhaust"
  | "drain"
  | "service",
  Vec3
> = {
  compressor: [3.5, -0.06, -0.28],
  condenser: [-0.18, -0.52, 0],
  receiver: [-0.18, -0.52, 0.15],
  expansion: [BLOWER[0] - 0.12, BLOWER[1] - 0.02, 0.38],
  evaporator: [BLOWER[0], BLOWER[1] - 0.015, 0.35],
  recircValve: [BLOWER[0], BLOWER[1] + 0.025, 0.35],
  recircInlet: [BLOWER[0] - 0.17, BLOWER[1] + 0.025, 0.35],
  condenserFan: [-0.38, -0.47, 0],
  intake: [-0.14, FUSE.lowerSkinY(-0.14, 0.1), 0.1],
  exhaust: [-0.43, FUSE.lowerSkinY(-0.43, -0.06), -0.06],
  drain: [BLOWER[0], FUSE.lowerSkinY(BLOWER[0], 0.35), 0.35],
  service: [2.45, -0.53, 0.42],
};
const cooling = () => {
  const { s, E } = useSR20.getState();
  return cabinOperation(s, E).ac;
};
const running = (m: THREE.Mesh) => {
  m.rotation.x = cooling() ? Math.PI / 6 : 0;
};

part(() => cyl(0.05, 0.12, "x"), ["environment", "engine"], {
  pos: AC.compressor,
  color: "#7E8A93",
  name: "A/C compressor (optional)",
  pin: true,
  pinIn: ["environment"],
  note: "Optional engine-driven R134A compressor; compresses refrigerant vapor and sends it to the condenser. The SR20 installation has a belt at the flywheel/ring gear and a mounting bracket/link shared with the alternator installation (AMM 12137-002 21-50 pp. 4–8, Fig 21-50-1 sheets 2–3). Electric clutch requires the 5 A A/C COMPR breaker on A/C BUS 2 and a running engine (POH 7-62). Component shape, pulley proportions and forward-engine station schematic; this is not the SR22T aft accessory-pad drive.",
});
/** Both belt pulleys lie in the flywheel plane; body/offsets remain schematic. */
export const AC_CLUTCH: Vec3 = [3.57, AC.compressor[1], AC.compressor[2]];
part(() => cyl(0.063, 0.018, "x", 28), ["environment", "engine"], {
  pos: AC_CLUTCH,
  color: "#596B76",
  name: "A/C compressor clutch pulley",
  pin: true,
  pinIn: ["environment"],
  anim: running,
  note: "Belt-driven compressor clutch pulley, electrically selected with A/C; clutch wiring disconnects separately from the compressor hoses (AMM 21-50 p. 4). Drawn at the compressor's drive end; sizes and station schematic.",
});
// Closed visual belt loop, positioned near the flywheel rather than the Continental rear accessory drive.
part(
  () => {
    const x = AC_CLUTCH[0],
      ring = [-0.14, 0],
      clutch = [AC_CLUTCH[1], AC_CLUTCH[2]];
    // External tangent belt spans around the two illustrative pulley radii, not a loose freeform loop.
    const radiusRing = 0.144,
      radiusClutch = 0.067;
    const separation = Math.hypot(clutch[0] - ring[0], clutch[1] - ring[1]);
    const direction = Math.atan2(clutch[1] - ring[1], clutch[0] - ring[0]);
    const tangent = Math.acos((radiusRing - radiusClutch) / separation);
    const arc = (center: number[], radius: number, start: number, end: number): Vec3[] =>
      Array.from({ length: 32 }, (_, i) => {
        const angle = start + ((end - start) * i) / 32;
        return [x, center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
      });
    const loop = [
      ...arc(ring, radiusRing, direction + tangent, direction + 2 * Math.PI - tangent),
      ...arc(clutch, radiusClutch, direction - tangent, direction + tangent),
    ];
    loop.push(loop[0]);
    return tubeGeo(loop, 0.004, 0.15);
  },
  ["environment", "engine"],
  {
    color: "#30363A",
    name: "A/C compressor drive belt",
    pin: true,
    pinIn: ["environment"],
    note: "Mechanical drive from flywheel pulley to compressor clutch pulley (AMM 21-50 pp. 5–8 and Fig 21-50-1 sheets 2–3). The belt loop is a schematic cue, with illustrative ring-gear center, pulley radii and tension; installation alignment and tension must come from the applicable AMM. Engine power drives refrigeration; A/C electrical power only commands the clutch and fans.",
  },
);
part(() => box(0.09, 0.02, 0.07), ["environment", "engine"], {
  pos: [AC.compressor[0], AC.compressor[1] - 0.063, AC.compressor[2]],
  color: "#7E8A93",
  name: "A/C compressor mounting link",
  pin: true,
  pinIn: ["environment"],
  note: "Compressor mounting bracket and adjustable link; the forward mounting boss also connects to the alternator link, and shims set pulley alignment (AMM 21-50 pp. 4–6, Fig 21-50-1 sheets 2–3). Schematic bracket only; dimensions and bolt locations approximate.",
});
part(() => box(0.2, 0.07, 0.2), ["environment"], {
  pos: AC.evaporator,
  color: "#6EC9E6",
  name: "A/C evaporator (optional)",
  pin: true,
  note: "Under the RH crew/front passenger seat. Refrigerant vaporizes in the coils, removing heat from cabin supply air; condensed moisture drains through the belly. The blower motor and wheel bolt to the evaporator (POH 7-65–66; AMM 21-50 pp. 1, 9–10, Fig 21-50-1 sheet 6). Optional installation represented schematically; size and under-seat station approximate.",
});
part(() => box(0.035, 0.04, 0.035), ["environment"], {
  pos: AC.expansion,
  color: "#C9A227",
  name: "Expansion valve",
  pin: true,
  note: "Temperature-controlled refrigerant metering valve integral to the evaporator assembly, between the receiver-drier liquid supply and evaporator (POH 7-66; AMM 21-50 p. 1, Fig 21-50-1 sheet 6 item 30). Dimensions and attachment offsets schematic.",
});
part(() => box(0.12, 0.004, 0.08), ["environment"], {
  pos: AC.recircValve,
  color: "#4E9DB5",
  name: "Recirculation check valve",
  pin: true,
  anim: (m) => {
    m.rotation.z = useSR20.getState().s.env.recirc ? 0.6 : 0;
  },
  note: "Valves in the evaporator assembly open to admit cabin return air in recirculation, shown as RECIRCULATION CHECK VALVE in the SR20 AMM Fig 21-00-1 sheet 2. A/C and blower selection are required (POH 7-67; AMM 21-50 p. 1). Door shape, location and travel schematic.",
});
part(() => box(0.24, 0.055, 0.24), ["environment"], {
  pos: AC.condenser,
  color: "#6EC9E6",
  name: "A/C condenser",
  pin: true,
  note: "Under the baggage compartment floor, accessed through CF5, with integral receiver-drier and blower (AMM 21-50 pp. 1, 12–15, Fig 21-50-1 sheet 7). Removes heat from refrigerant and changes compressor discharge vapor into liquid. Its cooling-air circuit is separate from conditioned cabin air. Size and underfloor station approximate.",
});
part(() => cyl(0.022, 0.08, "y"), ["environment"], {
  pos: AC.receiver,
  color: "#4E9DB5",
  name: "Receiver-drier",
  pin: true,
  note: "Clamped to the condenser; filters refrigerant, removes moisture and supplies steady liquid flow to the expansion valve (POH 7-66; AMM 21-50 pp. 1, 13–14, Fig 21-50-1 sheet 7 item 39). Location and shape schematic.",
});
part(() => cyl(0.04, 0.08, "x"), ["environment"], {
  pos: AC.condenserFan,
  color: "#5A6A74",
  name: "Condenser blower",
  pin: true,
  note: "Coupled to the condenser with a separate outlet duct to the belly exhaust screen (AMM 21-50 pp. 13–14, Fig 21-50-1 sheet 7 items 31, 40, 42). 15 A A/C COND breaker on A/C BUS 1 (POH 7-62). Cooling-air animation runs with the modeled refrigeration cycle; the cited AMM does not specify separate fan timing. Size and location approximate.",
});
for (const [key, name, note] of [
  [
    "intake",
    "Condenser intake screen",
    "Outside air enters the separate condenser cooling circuit; intake screen has a grounding strap",
  ],
  [
    "exhaust",
    "Condenser exhaust screen",
    "Condenser blower outlet duct exhausts heat overboard through a screen and air deflector",
  ],
] as const)
  part(() => box(0.09, 0.008, 0.085), ["environment"], {
    pos: AC[key],
    color: "#596B76",
    name,
    pin: true,
    ext: true,
    note: `${note} (AMM 21-50 Fig 21-50-1 sheet 7). Screen stations and sizes schematic; this air does not supply cabin vents.`,
  });
part(() => cyl(0.007, 0.016, "y", 10), ["environment"], {
  pos: AC.drain,
  color: "#92ADBD",
  name: "Evaporator condensate drain",
  pin: true,
  ext: true,
  note: "Drain hose from the evaporator exits through the fuselage belly and is secured to a rivnut (POH 7-66; AMM 21-50 pp. 9–10, Fig 21-50-1 sheet 6 items 24–26). Schematic exit location.",
});
part(() => mergeGeos([-1, 1].map((s) => cyl(0.008, 0.022, "z", 10).translate(s * 0.017, 0, 0))), ["environment"], {
  pos: AC.service,
  color: "#C9A227",
  name: "A/C service ports",
  pin: true,
  note: "High- and low-pressure refrigerant service ports on the cabin plumbing near the firewall (AMM 21-50 Fig 21-50-1 sheet 5 item 16). These service fittings are part of the refrigerant circuit, not cabin-air ducts. Shape and station schematic; no modeled refrigerant pressure or charge.",
});
