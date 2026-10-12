/** SR20 G6 door mechanisms: POH 11934-005 7-26, 7-33; AMM 12137-002 RA/A1 ch. 52.
 * Closed-door hardware study. No moving-door geometry or measured installation coordinates implied. */
import { densify, roundPoly } from "@/lib/geometry";
import { toVec3, type Vec3 } from "@/lib/math";
import { DOOR, box, cyl, onSkin, tubeGeo } from "../geometry";
import { part } from "./catalogue";

/** Inset below the surface keeps internal mechanisms inside the approximate fuselage. */
export const doorHardwarePoint = (x: number, y: number, side: number, inset = 0.035): Vec3 => {
  const p = onSkin(x, y, side, 1);
  p.z -= side * inset;
  return toVec3(p);
};
export const DOOR_HANDLE = (side: number) => doorHardwarePoint(1.28, -0.04, side, 0.05);
export const DOOR_LATCH = (side: number, upper: boolean) =>
  doorHardwarePoint(upper ? 0.855 : 0.87, upper ? 0.51 : -0.26, side);
export const BAGGAGE_DOOR = roundPoly(
  [
    [-0.36, -0.31],
    [-0.36, 0.09],
    [0.06, 0.09],
    [0.08, -0.31],
  ],
  0.07,
);
export const BAGGAGE_HANDLE = doorHardwarePoint(-0.28, -0.12, -1, 0.02);

for (const side of [-1, 1]) {
  const handle = DOOR_HANDLE(side),
    latchU = DOOR_LATCH(side, true),
    latchL = DOOR_LATCH(side, false);
  part(
    () =>
      tubeGeo(
        [
          ...densify(DOOR).map(([x, y]) => doorHardwarePoint(x, y, side, 0.018)),
          doorHardwarePoint(DOOR[0][0], DOOR[0][1], side, 0.018),
        ],
        0.004,
      ),
    ["doors", "cabin"],
    {
      color: "#42494D",
      name: "Cabin door perimeter seal",
      pin: side < 0,
      pinIn: ["doors"],
      note: "Seal around each forward-hinged cabin door opening. Trapped unvented air in a seal bulb can make closure difficult (AMM 52-10 p. 2; seal practices in 53-40). Outline follows the model's photographed G6 seam; seal thickness and loft inset approximate.",
    },
  );
  for (const [y, name] of [
    [0.39, "Upper cabin door hinge"],
    [-0.22, "Lower cabin door hinge"],
  ] as const)
    part(() => cyl(0.011, 0.06, "y"), ["doors", "cabin"], {
      pos: doorHardwarePoint(y > 0 ? 1.81 : 1.95, y, side, y > 0 ? 0.05 : 0.025),
      color: "#85939C",
      name,
      pin: side < 0,
      pinIn: ["doors"],
      note: "Forward hinge bar/rod-end connection to the fuselage fitting, supporting the door's upward opening motion (POH 7-33; AMM 52-10 Fig 52-10-1). Pin orientation, size and offsets illustrative.",
    });
  const strutA = doorHardwarePoint(1.85, 0.05, side, 0.12),
    strutB = doorHardwarePoint(1.48, -0.03, side, 0.045);
  part(() => tubeGeo([strutA, strutB], 0.01, 0), ["doors", "cabin"], {
    color: "#85939C",
    name: "Cabin door gas strut",
    pin: side < 0,
    pinIn: ["doors"],
    note: "Gas-charged strut assists opening and holds the forward-hinged door open against gusts (POH 7-33; AMM 52-10 p. 1 and Fig 52-10-1). Closed-position strut and attachment stations schematic; the static model does not demonstrate its extension or loads.",
  });
  part(() => box(0.035, 0.025, 0.025), ["doors"], {
    pos: strutA,
    color: "#85939C",
    name: "Gas strut catcher/diverter",
    pin: side < 0,
    note: "Catcher/diverter mounted on top of the forward gas-strut attach bracket, positioned to capture the strut rod end (AMM 52-10 p. 17). Schematic form and position.",
  });
  part(() => box(0.3, 0.035, 0.08), ["doors", "cabin"], {
    pos: doorHardwarePoint(1.3, -0.075, side, 0.055),
    color: "#837C70",
    name: "Cabin door armrest",
    pin: side < 0,
    pinIn: ["doors"],
    note: "Front-seat armrest integral to each cabin door. The inside handle nests flush into it when latched; when unlatched the lever projects upward into the occupant's forearm as a tactile indication (POH 7-33; AMM 52-10 p. 1). Dimensions approximate.",
  });
  part(() => box(0.13, 0.014, 0.018), ["doors", "cabin"], {
    pos: handle,
    color: "#D9DEE1",
    name: "Interior cabin door handle",
    pin: side < 0,
    pinIn: ["doors"],
    note: "Centered beneath the window, in the door armrest. Lifting either handle operates the pull cable and linkage to release both upper and lower aft latches; either handle can also draw a partly closed door into positive engagement (AMM 52-10 p. 1, Fig 52-10-3). Closed position shown; dimensions approximate.",
  });
  part(() => box(0.15, 0.026, 0.008), ["doors"], {
    pos: doorHardwarePoint(1.28, 0.02, side, 0.008),
    color: "#667079",
    name: "Exterior cabin door handle",
    pin: side < 0,
    note: "Flush-mount outside lever in a recessed housing. Rotate upward to disengage both rear latches; a slam catch and handle-operated draw-in latch provide positive closure (AMM 52-10 p. 1, Fig 52-10-3). Size and recess schematic.",
  });
  part(() => cyl(0.011, 0.008, "z", 16), ["doors"], {
    pos: doorHardwarePoint(1.17, 0.015, side, 0.008),
    color: "#C6CED3",
    name: "Cabin door key lock",
    pin: side < 0,
    note: "Key-operated external security lock disables outside access without preventing escape from inside. Cabin keys also operate the baggage lock (POH 7-33; AMM 52-10 p. 1). Optional convenience-lighting key fob locks/unlocks cabin doors; BAT 1 ON automatically unlocks them, and the key fob does not actuate them with BAT 1 ON. Size approximate.",
  });
  for (const [upper, at] of [
    [true, latchU],
    [false, latchL],
  ] as const)
    part(() => box(0.03, 0.035, 0.025), ["doors"], {
      pos: at,
      color: "#8B949B",
      name: upper ? "Upper aft door latch" : "Lower aft door latch",
      pin: side < 0,
      note: "Rear-perimeter latch operated through the handle actuation assembly, pull cable and linkage. It engages its jamb pin and provides slam-catch or manually commanded draw-in engagement (AMM 52-10 p. 1, Fig 52-10-3). The POH calls these latching pins in frame receptacles (7-33). Size and latch stations approximate.",
    });
  part(() => tubeGeo([handle, doorHardwarePoint(1.05, 0.08, side), latchU], 0.003, 0), ["doors"], {
    name: "Cabin door latch pull cable",
    pin: side < 0,
    color: "#C9A755",
    note: "Handle assembly to upper latch pull-cable branch; lower latch also uses a link/gearbox connection (AMM 52-10 p. 1, Fig 52-10-3). Cable path, bends and thickness schematic; no powered flow is implied.",
  });
  part(() => tubeGeo([handle, doorHardwarePoint(1.05, -0.2, side), latchL], 0.005, 0), ["doors"], {
    name: "Cabin door lower latch linkage",
    pin: side < 0,
    color: "#C9A755",
    note: "Lower gearbox/link branch connects the handle actuation assembly to the lower latch. Rod-end/link adjustment sets the inside-handle angle and flushness with the armrest (AMM 52-10 pp. 20–21, Fig 52-10-3). Routing and dimensions schematic.",
  });
}
part(
  () =>
    tubeGeo(
      [
        ...densify(BAGGAGE_DOOR).map(([x, y]) => doorHardwarePoint(x, y, -1, 0.005)),
        doorHardwarePoint(BAGGAGE_DOOR[0][0], BAGGAGE_DOOR[0][1], -1, 0.005),
      ],
      0.004,
    ),
  ["doors", "cabin"],
  {
    name: "Baggage door",
    color: "#85939C",
    pin: true,
    pinIn: ["doors"],
    note: "Left fuselage aft of the wing, hinged on its forward edge and latched/locked at its rear edge (POH 7-26; AMM 52-30). Pre-2901 G6 manual key lock represented; later serial 8500 power-lock equipment is not used. Only the outline and hardware are shown; panel outline and station approximate.",
  },
);
part(() => cyl(0.012, 0.008, "z", 16), ["doors"], {
  pos: BAGGAGE_HANDLE,
  name: "Baggage door key lock",
  color: "#C6CED3",
  pin: true,
  note: "Outside key lock at the rear edge; uses the same key as the cabin doors (POH 7-26). Pre-2901 installation follows AMM 53-40 Fig 53-40-7 sheet 1; dimensions and position approximate.",
});
part(() => cyl(0.011, 0.14, "y"), ["doors"], {
  pos: doorHardwarePoint(0.07, -0.11, -1, 0.035),
  name: "Baggage door forward hinge",
  color: "#85939C",
  pin: true,
  note: "Forward-edge baggage-door hinge (POH 7-26; AMM 52-30). Static closed-position hardware; size approximate.",
});
