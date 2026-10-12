/**
 * SR20 G6 landing gear and independent hydraulic brakes.
 * POH 11934-005 7-25–26; AMM 12137-002 Reissue A / A1, ATA 32-10, 32-20, 32-41, 32-42.
 * Undimensioned hardware sizes and hydraulic routing are illustrative. Preserve noseGear/caster group datums.
 */
import * as THREE from "three";
import { brakeAmount, brakeAnim } from "@/lib/anims";
import { gearLegGeo } from "@/lib/geometry";
import { type Vec3 } from "@/lib/math";
import { box, cyl, loft, pantGeo, tubeGeo, wingP } from "../geometry";
import { useSR20 } from "../store";
import { part } from "./catalogue";

const STEEL = "#929CA5",
  FLUID = "#B85258";
export const MG = { x: 1.12, y: -1.2, z: 1.42 };
export const NOSE_GEAR: Vec3 = [3.06, -0.52, 0];
export const NOSE_CASTER: Vec3 = [0.22, -0.68, 0];
export const PARK_HANDLE: Vec3 = [2.16, -0.17, -0.17];
export const PARK_VALVE: Vec3 = [2.59, -0.49, -0.12];
export const BRAKE_RESERVOIR: Vec3 = [2.78, 0.035, 0.31];
export const PEDALS = [-0.36, -0.14, 0.14, 0.36] as const;
/** Corresponding toes at both stations operate the same wheel: POH 7-25. */
export const toeSide = (z: number) => (z === -0.36 || z === 0.14 ? -1 : 1);
export const masterCylinder = (z: number): Vec3 => [2.49, -0.56, z];
export const brakeTee = (side: number): Vec3 => [2.52, -0.65, side * 0.23];
export const valvePort = (side: number, master = false): Vec3 => [
  PARK_VALVE[0] + (side < 0 ? 0.025 : -0.025),
  PARK_VALVE[1] - (master ? 0 : 0.04),
  PARK_VALVE[2] + (master ? side * 0.035 : 0),
];
export const brakeInlet = (side: number): Vec3 => [MG.x - 0.14, MG.y - 0.02, side * (MG.z - 0.15)];
export const mainStrutPath = (side: number): Vec3[] => [
  wingP(side * 27.5 * 0.0254, 0.45, -1)
    .add(new THREE.Vector3(0, 0.05, 0))
    .toArray() as Vec3,
  wingP(side * 37 * 0.0254, 0.45, -1).toArray() as Vec3,
  [1.14, -0.9, side * 1.22],
  [MG.x, MG.y, side * (MG.z - 0.15)],
];
export const brakePressurePath = (side: number): Vec3[] => [
  valvePort(side),
  [2.52, -0.655, side * 0.23],
  [1.5, -0.655, side * 0.3],
  wingP(side * 0.6, 0.53, -1)
    .lerp(wingP(side * 0.6, 0.53, 1), 0.3)
    .toArray() as Vec3,
  wingP(side * 37 * 0.0254, 0.45, -1).toArray() as Vec3,
  [MG.x - 0.06, -0.9, side * 1.22],
  [MG.x - 0.06, -1.15, side * (MG.z - 0.15)],
  brakeInlet(side),
];

for (const side of [1, -1]) {
  const upper = mainStrutPath(side)[0],
    lower = mainStrutPath(side)[1];
  part(() => gearLegGeo(mainStrutPath(side), 0.2, 0.05), ["gear"], {
    color: "#B5A990",
    name: "Main gear strut",
    pin: side > 0,
    ext: true,
    note: "Fiberglass spring strut, clamped by upper and lower attach fittings and two lateral aluminum ribs between WS 27 and WS 37 (AMM 32-10 p. 1, Fig 32-10-2). The wing spar and shear web carry the attachment loads (POH 7-25). Shape approximate.",
  });
  for (const [name, pos] of [
    ["Main gear upper attach fitting", upper],
    ["Main gear lower attach fitting", lower],
  ] as const)
    part(() => box(0.22, 0.06, 0.055), ["gear"], {
      pos,
      color: STEEL,
      name,
      ext: name === "Main gear lower attach fitting",
      note: "Attach fitting clamps the composite strut to lateral ribs and wing structure. The lower fitting bolts through the lower wing skin at WS 37 and its exposed clamp grips the strut (AMM 32-10 p. 1, Fig 32-10-2). Dimensions approximate.",
    });
  for (const chord of [0.4, 0.5])
    part(
      () => {
        const rings = [27, 32, 37].map((ws) =>
          [-0.003, 0.003].flatMap((dx) =>
            [1, -1].map((surface) => {
              const v = wingP(side * ws * 0.0254, chord, surface);
              v.x += dx;
              v.y -= surface * 0.002;
              return v;
            }),
          ),
        );
        // Rectangle winding: lower front, upper front, upper aft, lower aft.
        rings.forEach((r) => {
          const t = r[2];
          r[2] = r[3];
          r[3] = t;
          if (side < 0) r.reverse();
        });
        return loft(rings);
      },
      ["gear"],
      {
        color: STEEL,
        name: "Gear lateral rib",
        plate: true,
        note: "Two aluminum lateral ribs support the main gear attach fittings between WS 27 and WS 37 (AMM 32-10 p. 1, Fig 32-10-2). Thickness and chord location approximate.",
      },
    );
  part(() => gearLegGeo(mainStrutPath(side).slice(1, 3), 0.24, 0.07), ["gear"], {
    color: "#F3F5F6",
    name: "Main strut fairing",
    fairing: true,
    ext: true,
    note: "Removable upper fairing surrounds the composite spring and brake line; lower wheel fairing encloses the wheel (AMM 32-10 pp. 3–4, Fig 32-10-1). Geometry approximate.",
  });
  part(() => cyl((15 * 0.0254) / 2, 6 * 0.0254, "z", 32), ["gear"], {
    pos: [MG.x, MG.y, side * MG.z],
    color: "#2A2F33",
    name: "Main wheel",
    ext: true,
    note: "15 × 6.00 × 6 tubeless tire (POH 7-25); two wheel halves, sealed bearings and bearing retainers (AMM 32-41 Fig 32-41-1).",
  });
  part(() => cyl((6 * 0.0254) / 2, 0.158, "z", 24), ["gear"], {
    pos: [MG.x, MG.y, side * MG.z],
    color: STEEL,
    name: "Main wheel hub",
    ext: true,
    note: "Wheel halves and sealed bearings rotate on the axle (AMM 32-41 Fig 32-41-1); hub diameter follows the six-inch wheel size, other dimensions illustrative.",
  });
  part(() => cyl(0.025, 0.29, "z"), ["gear"], {
    pos: [MG.x, MG.y, side * (MG.z - 0.05)],
    color: STEEL,
    name: "Main wheel axle",
    ext: true,
    note: "Axle attaches to the composite strut. A castellated nut and cotter pin retain the wheel (AMM 32-41 Fig 32-41-1).",
  });
  part(() => cyl(0.027, 0.012, "z", 6), ["gear"], {
    pos: [MG.x, MG.y, side * (MG.z + 0.085)],
    color: STEEL,
    name: "Main axle nut",
    ext: true,
  });
  part(() => cyl(0.002, 0.065, "y", 6), ["gear"], {
    pos: [MG.x, MG.y, side * (MG.z + 0.085)],
    color: "#C4C9CE",
    name: "Main axle cotter pin",
    ext: true,
  });
  part(() => pantGeo(0.92, 0.21), ["gear"], {
    pos: [MG.x, -1.17, side * MG.z],
    scale: [1, 1, 0.75],
    fairing: true,
    color: "#F3F5F6",
    name: "Wheel pant",
    ext: true,
    note: "Removable wheel fairing; access door allows tire inflation without fairing removal (POH 7-25; AMM 32-10 Fig 32-10-1). Size approximate.",
  });
  part(() => box(0.055, 0.065, 0.006), ["gear"], {
    pos: [MG.x - 0.06, MG.y + 0.02, side * (MG.z - 0.157)],
    color: "#D6DEE3",
    name: "Wheel pant access door",
    ext: true,
    note: "Inflation access door in the inboard fairing (AMM Fig 32-10-1; POH 7-25). Placement approximate.",
  });
  const discZ = side * (MG.z - 0.095);
  part(() => cyl(0.12, 0.016, "z", 32), ["gear"], {
    pos: [MG.x, MG.y, discZ],
    color: "#A6ADB2",
    name: "Brake disc",
    ext: true,
    note: "Single disc per main wheel. Brake pads grip its two faces (POH 7-25; AMM 32-42 Fig 32-42-1). Dimensions approximate.",
  });
  part(() => box(0.09, 0.09, 0.09), ["gear"], {
    pos: brakeInlet(side),
    color: STEEL,
    name: "Brake caliper",
    ext: true,
    pin: side > 0,
    anim: brakeAnim(() => brakeAmount(useSR20.getState().s.gear, side > 0 ? "R" : "L")),
    note: "Single-cylinder, dual-piston hydraulic caliper (POH 7-25). Separate brake pads, back plate, bleed screw and temperature sensor (AMM 32-42 Fig 32-42-1). Braking pressure is illustrative.",
  });
  for (const face of [-1, 1])
    part(() => box(0.074, 0.062, 0.006), ["gear"], {
      pos: [MG.x - 0.087, MG.y - 0.02, discZ + face * 0.012],
      color: "#5D5048",
      name: "Brake pad",
      ext: true,
      note: "Friction lining at each disc face (AMM 32-42 Fig 32-42-1).",
    });
  part(() => box(0.09, 0.085, 0.008), ["gear"], {
    pos: [MG.x - 0.09, MG.y - 0.02, discZ + side * 0.024],
    color: STEEL,
    name: "Brake back plate",
    ext: true,
    note: "Back plate reacts pad force at the opposite disc face (AMM 32-42 Fig 32-42-1). Dimensions illustrative.",
  });
  part(() => box(0.045, 0.1, 0.015), ["gear"], {
    pos: [MG.x - 0.105, MG.y, brakeInlet(side)[2]],
    color: STEEL,
    name: "Brake torque plate",
    ext: true,
    note: "Axle-mounted torque plate supports the brake assembly (AMM 32-42 Fig 32-42-1). Dimensions illustrative.",
  });
  part(() => cyl(0.004, 0.02, "y", 8), ["gear"], {
    pos: [brakeInlet(side)[0], MG.y - 0.075, brakeInlet(side)[2]],
    color: STEEL,
    name: "Brake bleed screw",
    ext: true,
    note: "Bleeder fitting permits removal of trapped air; air produces spongy pedals (AMM 32-42 pp. 31–33).",
  });
  part(() => cyl(0.006, 0.018, "x"), ["gear"], {
    pos: [brakeInlet(side)[0] - 0.052, MG.y - 0.02, brakeInlet(side)[2]],
    color: "#D6A34B",
    name: "Brake temperature sensor",
    ext: true,
    note: "Sensor at each brake assembly feeds avionics annunciations; powered through 3 A ENGINE INSTR on Main Bus 2 (AMM 32-42 p. 1). Separate from the irreversible overheat indicator.",
  });
  part(() => box(0.028, 0.008, 0.012), ["gear"], {
    pos: [brakeInlet(side)[0], MG.y + 0.03, brakeInlet(side)[2]],
    color: "#E7C8A3",
    name: "Brake overheat indicator",
    ext: true,
    note: "Caliper piston-housing indicator turns black after overheating (AMM 32-42 p. 1). Sensor temperature and permanent indicator are different checks.",
  });
}

part(
  () =>
    tubeGeo(
      [
        [0, 0, 0],
        [0.09, -0.34, 0],
        [0.22, -0.66, 0],
      ],
      0.032,
    ),
  ["gear"],
  {
    parent: "noseGear",
    color: STEEL,
    name: "Nose gear strut",
    ext: true,
    pin: true,
    note: "Tubular steel strut reacts into the engine mount; a separate nitrogen/fluid oleo absorbs shock (POH 7-25; AMM 32-20 p. 1). Geometry approximate.",
  },
);
// The shock absorber stays on the strut/mount, while the spindle, fork, axle, wheel and pant caster below it.
export const NOSE_OLEO: [Vec3, Vec3] = [
  [0.025, 0.13, 0],
  [0.082, -0.31, 0],
];
part(() => tubeGeo([NOSE_OLEO[0], [0.061, -0.16, 0]], 0.027, 0), ["gear"], {
  parent: "noseGear",
  color: "#65717B",
  name: "Nose oleo cylinder",
  ext: true,
  note: "Oleo-pneumatic cylinder contains nitrogen and hydraulic fluid; compression of its piston reacts against the engine mount (AMM 32-20 p. 1, Fig 32-20-2). Position and diameter approximate.",
});
part(() => tubeGeo([[0.061, -0.16, 0], NOSE_OLEO[1]], 0.012, 0), ["gear"], {
  parent: "noseGear",
  color: "#CCD3D8",
  name: "Nose oleo piston rod",
  ext: true,
  note: "Chromed piston rod connects the oleo to the nose strut. AMM 32-20 pp. 12–14 describes its extension check; the illustrated extension is schematic, not a servicing gauge.",
});
part(() => cyl(0.005, 0.018, "x"), ["gear"], {
  parent: "noseGear",
  pos: [0.025, 0.13, 0.025],
  color: STEEL,
  name: "Oleo fill valve",
  ext: true,
  note: "Capped valve for oleo nitrogen/fluid servicing (AMM 32-20 Fig 32-20-2).",
});
part(
  () =>
    tubeGeo(
      [
        [0.035, -0.06, 0],
        [0.09, -0.34, 0],
        [0.205, -0.59, 0],
      ],
      0.05,
    ),
  ["gear"],
  {
    parent: "noseGear",
    color: "#F3F5F6",
    name: "Nose strut fairing",
    fairing: true,
    ext: true,
    note: "Removable fairing surrounds the tubular strut (AMM 32-20 Fig 32-20-1).",
  },
);
for (const side of [-1, 1]) {
  part(
    () =>
      tubeGeo(
        [
          [0, 0.09, 0],
          [0, 0.075, side * 0.069],
          [0.02, 0, side * 0.069],
        ],
        0.012,
        0,
      ),
    ["gear"],
    {
      parent: "caster",
      color: STEEL,
      name: "Nose wheel fork",
      ext: true,
      note: "Fork casters on its spindle; its axle carries the wheel. Bearings, thrust washer and Belleville washer preload control swivel friction (AMM 32-20 pp. 19–22, Fig 32-20-4).",
    },
  );
  part(() => cyl(0.028, 0.008, "z"), ["gear"], {
    parent: "caster",
    pos: [0.02, 0, side * 0.055],
    color: STEEL,
    name: "Nose wheel bearing",
    ext: true,
    note: "Wheel bearing and seal at each side of nose wheel (AMM 32-41 Fig 32-41-2).",
  });
}
part(() => cyl(0.012, 0.158, "z"), ["gear"], {
  parent: "caster",
  pos: [0.02, 0, 0],
  color: STEEL,
  name: "Nose wheel axle",
  ext: true,
});
part(() => cyl(0.17, 0.11, "z", 32), ["gear"], {
  parent: "caster",
  pos: [0.02, 0, 0],
  color: "#2A2F33",
  name: "Nose wheel",
  ext: true,
  note: "5.00 × 5 tubeless tire. Free-castering through approximately 170°; differential main-wheel braking steers the airplane (POH 7-25).",
});
part(() => cyl((5 * 0.0254) / 2, 0.114, "z", 24), ["gear"], {
  parent: "caster",
  pos: [0.02, 0, 0],
  color: STEEL,
  name: "Nose wheel hub",
  ext: true,
});
part(() => cyl(0.022, 0.06, "y"), ["gear"], {
  parent: "caster",
  pos: [0, 0.1, 0],
  color: STEEL,
  name: "Caster spindle",
  ext: true,
  note: "Vertical caster spindle and spindle cup provide the swivel axis (AMM 32-20 Fig 32-20-4). Lower-end position approximate.",
});
for (const [name, y, r] of [
  ["Caster thrust washer", 0.132, 0.027],
  ["Belleville washer stack", 0.139, 0.029],
  ["Caster spindle nut", 0.151, 0.021],
] as const)
  part(() => cyl(r, 0.009, "y", name.includes("nut") ? 6 : 24), ["gear"], {
    parent: "caster",
    pos: [0, y, 0],
    color: STEEL,
    name,
    ext: true,
    note: "Correct thrust-washer orientation and Belleville preload prevent shimmy. AMM 32-20 pp. 19–20 checks 20–25 lb at the axle to swivel the fork; no separate hydraulic shimmy damper is specified. Stack dimensions illustrative.",
  });
part(() => pantGeo(0.7, 0.18), ["gear"], {
  parent: "caster",
  pos: [0.02, 0.02, 0],
  scale: [1, 1, 0.7],
  fairing: true,
  color: "#F3F5F6",
  name: "Nose wheel pant",
  ext: true,
  note: "Removable nose fairing with tire inflation access door (AMM 32-20 Fig 32-20-1).",
});
part(() => box(0.055, 0.055, 0.004), ["gear"], {
  parent: "caster",
  pos: [-0.08, 0.025, -0.11],
  color: "#D6DEE3",
  name: "Nose pant access door",
  ext: true,
});

part(() => cyl(0.031, 0.085, "y", 24), ["gear"], {
  pos: BRAKE_RESERVOIR,
  color: "#D5A879",
  name: "Brake fluid reservoir",
  pin: true,
  note: "One common reservoir supplies the four master cylinders. Mounted on the upper RH firewall / right battery-support frame (AMM 32-42 p. 1, Fig 32-42-4; POH 8-13). MIL-PRF-87257 fluid. Placement approximate.",
});
part(() => cyl(0.028, 0.01, "y", 24), ["gear"], {
  pos: [BRAKE_RESERVOIR[0], BRAKE_RESERVOIR[1] + 0.048, BRAKE_RESERVOIR[2]],
  color: STEEL,
  name: "Brake reservoir cap",
});
part(() => box(0.07, 0.025, 0.07), ["gear"], {
  pos: [BRAKE_RESERVOIR[0], BRAKE_RESERVOIR[1] - 0.056, BRAKE_RESERVOIR[2]],
  color: STEEL,
  name: "Brake reservoir bracket",
  note: "Bracket attached to RH battery support (AMM Fig 32-42-4).",
});
part(() => box(0.065, 0.075, 0.085), ["gear"], {
  pos: PARK_VALVE,
  color: FLUID,
  name: "Parking brake valve",
  pin: true,
  note: "Mounted beside the firewall on LH outboard console rib (AMM 32-42 p. 1). Pushed-in handle mechanically holds both valve poppets open; pulling the handle traps applied wheel-brake pressure (POH 7-26). Forward circuit is LH and aft circuit RH (AMM 32-42 p. 24).",
});
part(() => box(0.04, 0.025, 0.07), ["gear"], {
  pos: PARK_HANDLE,
  name: "PARK BRAKE handle",
  pin: true,
  anim: (m) => {
    m.position.x = PARK_HANDLE[0] - (useSR20.getState().s.gear.park ? 0.025 : 0);
  },
  note: "Right side kick plate by pilot’s right knee (POH 7-26; AMM calls the panel LH kick plate). Apply toe brakes then pull aft; handle alone traps existing pressure. Never set in flight.",
});
part(
  () =>
    tubeGeo(
      [PARK_HANDLE, [2.4, -0.31, -0.17], [2.58, -0.41, -0.15], [PARK_VALVE[0] + 0.04, PARK_VALVE[1], PARK_VALVE[2]]],
      0.004,
      0,
    ),
  ["gear"],
  {
    color: "#7D858D",
    name: "Parking brake control cable",
    note: "Mechanical handle cable drives the valve actuation arm (AMM 32-42 pp. 24–26, Fig 32-42-4). Routing approximate.",
  },
);
part(() => box(0.04, 0.01, 0.013), ["gear"], {
  pos: [PARK_VALVE[0] + 0.04, PARK_VALVE[1], PARK_VALVE[2]],
  color: STEEL,
  name: "Parking valve actuation arm",
  anim: (m) => {
    m.rotation.x = useSR20.getState().s.gear.park ? -0.5 : 0;
  },
  note: "Control cable pulls the valve arm; a nearby position switch sends its state to the GEA 71 (AMM 32-42 p. 1). Animation schematic.",
});
part(() => box(0.012, 0.012, 0.016), ["gear"], {
  pos: [PARK_VALVE[0] + 0.04, PARK_VALVE[1] + 0.02, PARK_VALVE[2]],
  color: "#D7A04D",
  name: "Parking brake position sensor",
  note: "Valve-arm position sensor → GEA 71 → PARK BRAKE CAS caution (AMM 32-42 p. 1; POH Section 3A).",
});
for (const z of PEDALS) {
  const side = toeSide(z),
    parent = side < 0 ? "rig:pedL" : "rig:pedR";
  part(() => box(0.04, 0.18, 0.09), ["gear", "controls"], {
    chan: ["rudder"],
    parent,
    pos: [2.42, -0.52, z],
    rot: [0, 0, 0.35],
    name: "Rudder pedal / toe brake",
    note: "Top half applies this side’s wheel brake independently; corresponding pilot and copilot pedals operate the same wheel (POH 7-25). Rudder pedal movement drives the primary cable linkage (POH Fig 7-3).",
  });
  part(() => cyl(0.016, 0.1, "y"), ["gear"], {
    pos: masterCylinder(z),
    color: STEEL,
    name: "Brake master cylinder",
    pin: z === -0.36,
    note: "One master cylinder per pedal. Body pinned to floorboard; piston-rod clevis connects to upper pedal (AMM 32-42 p. 23). Upper port is inlet, lower port outlet. Four masters share one reservoir but left/right braking circuits remain independent.",
  });
  part(() => cyl(0.006, 0.045, "y"), ["gear"], {
    parent,
    pos: [2.49, -0.488, z],
    color: "#CDD4DB",
    name: "Master-cylinder piston rod",
    note: "Rod clevis follows its pedal while the cylinder body mounts to the floor (AMM 32-42 p. 23). Pedal/rod movement illustrative.",
  });
}
