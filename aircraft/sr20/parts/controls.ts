/**
 * Flight-control mechanisms (POH Figures 7-1, 7-2, 7-3): elevator torque tube and sectors, aileron carriages and
 * central sector, rudder pedal torque tube and horn, pulleys, bellcranks, turnbuckles and cable guides.
 */
import * as THREE from "three";
import { chanOfKey } from "@/lib/catalogue";
import { box, cyl, wingP } from "../geometry";
import {
  AIL_DRIVE,
  AIL_SECTOR,
  CARR,
  ELEV_HORN,
  ETT,
  LEVER_ANG,
  PEDAL_TT,
  PULLEYS,
  RUD_HORN,
  RUD_HORN_AFT,
  alongCable,
  pulleyGeo,
  sectorGeo,
} from "../rig";
import { part, surfacePivot } from "./catalogue";

/* ---------- flight-control mechanisms (POH Figures 7-1, 7-2, 7-3) ---------- */
const CTL = "#7C57CF",
  STEEL = "#8C959C";
// elevator: lateral torque tube under the panel with end levers and the forward cable sector
part(() => cyl(0.016, ETT.half * 2, "z"), ["controls"], {
  chan: ["elevator"],
  parent: "rig:ett",
  color: STEEL,
  name: "Elevator torque tube",
  note: "Lateral torque tube under the panel. Drop links from both yoke tubes rotate it; its forward sector drives the elevator cables (POH Fig. 7-1).",
  pin: true,
});
[-1, 1].forEach((sd) =>
  part(() => box(0.02, ETT.lever, 0.02), ["controls"], {
    chan: ["elevator"],
    parent: "rig:ett",
    pos: [(Math.sin(LEVER_ANG) * ETT.lever) / 2, (Math.cos(LEVER_ANG) * ETT.lever) / 2, sd * CARR.z],
    rot: [0, 0, -LEVER_ANG],
    color: STEEL,
    name: "Torque tube lever",
    note: "Lever arm at each end of the elevator torque tube; the yoke drop link attaches to its tip.",
  }),
);
part(() => sectorGeo(ETT.sectorR), ["controls"], {
  chan: ["elevator"],
  parent: "rig:ett",
  pos: [0, 0, ETT.sectorZ],
  color: CTL,
  name: "Forward elevator sector",
  note: "Cable sector on the torque tube. The two elevator cables leave it as a crossed pair to the forward pulleys.",
  pin: true,
});
part(() => cyl(0.02, 0.05, "z"), ["controls"], {
  chan: ["elevator"],
  pos: [ETT.c[0], ETT.c[1], -0.25],
  color: "#5A636A",
  name: "Torque tube bearing block",
  note: "Bearing blocks support the elevator torque tube.",
});
part(() => cyl(0.02, 0.05, "z"), ["controls"], {
  chan: ["elevator"],
  pos: [ETT.c[0], ETT.c[1], 0.25],
  color: "#5A636A",
});
// aileron: pivoting bearing carriages, central pulley sector
[-1, 1].forEach((sd) => {
  const parent = "rig:carr:" + (sd < 0 ? "L" : "R");
  part(() => box(0.2, 0.02, 0.05), ["controls"], {
    chan: ["aileron"],
    parent,
    pos: [0, -0.03, 0],
    color: STEEL,
    name: "Aileron bearing carriage",
    note: "The yoke tube rotates this pivoting carriage for roll and slides through it for pitch (POH Fig. 7-2).",
    pin: sd > 0,
  });
  part(() => box(0.02, CARR.arm, 0.02), ["controls"], {
    chan: ["aileron"],
    parent,
    pos: [CARR.armX, -CARR.arm / 2, 0],
    color: STEEL,
    name: "Carriage arm",
    note: "Drives the lateral push rod to the central aileron sector.",
  });
});
part(
  () => {
    const g = new THREE.CylinderGeometry(AIL_SECTOR.r, AIL_SECTOR.r, 0.014, 32);
    g.rotateZ(Math.PI / 2);
    return g;
  },
  ["controls"],
  {
    chan: ["aileron"],
    parent: "rig:ailSector",
    color: CTL,
    name: "Central aileron pulley sector",
    note: "Centrally located pulley sector: the push rod turns it and it drives both aileron cables down to the floor pulleys.",
    pin: true,
  },
);
part(() => box(0.012, 0.02, 0.012), ["controls"], {
  chan: ["aileron"],
  parent: "rig:ailSector",
  pos: [0, AIL_SECTOR.r, 0],
  color: STEEL,
});
// rudder: pedal torque tube and cable horn
part(() => cyl(0.014, PEDAL_TT.half * 2, "z"), ["controls", "gear"], {
  chan: ["rudder"],
  pos: [PEDAL_TT.x, PEDAL_TT.y, 0],
  color: STEEL,
  name: "Rudder pedal torque tube",
  note: "Carries the four pedals; springs and a ground-adjustable spring cartridge here centre the rudder.",
  pin: true,
});
part(() => box(0.03, 0.02, RUD_HORN.half * 2 + 0.02), ["controls"], {
  chan: ["rudder"],
  parent: "rig:rudHorn",
  color: CTL,
  name: "Rudder cable horn",
  note: "Pedal links pivot this horn; its ends pull the two rudder cable strands.",
  pin: true,
});
part(() => cyl(0.008, 0.05, "y"), ["controls"], { chan: ["rudder"], pos: RUD_HORN.c, color: STEEL });
// arm from each pedal pair's inboard pedal across to its pedal link
[-1, 1].forEach((sd) => {
  const z0 = sd * 0.14,
    z1 = RUD_HORN.c[2] + sd * RUD_HORN.half;
  part(() => box(0.02, 0.015, Math.abs(z1 - z0) + 0.02), ["controls"], {
    chan: ["rudder"],
    parent: sd < 0 ? "rig:pedL" : "rig:pedR",
    pos: [PEDAL_TT.x, RUD_HORN.c[1], (z0 + z1) / 2],
    color: STEEL,
    name: "Pedal arm",
    note: "Ties each pedal pair to its pedal link; pushing a pedal forward pulls the horn.",
  });
});
// pulleys (each in its own group so it can turn with cable travel)
Object.entries(PULLEYS).forEach(([k, d]) =>
  part(() => pulleyGeo(d.r, d.axis, d.double, d.gap), ["controls"], {
    chan: chanOfKey(k === "ef" || k === "em" || k === "ea" ? "el" : k.startsWith("a") ? "ail" : "rud"),
    parent: "rig:pul:" + k,
    color: k === "ea" || k === "ra" || k.startsWith("aw") ? CTL : "#A6AEB4",
    name: d.name,
    note: d.note,
    pin: true,
  }),
);
// crank pins on the aft sectors
part(() => cyl(0.008, 0.03, "z"), ["controls"], {
  chan: ["elevator"],
  parent: "rig:pul:ea",
  pos: [0, -0.06, 0],
  color: STEEL,
});
part(() => cyl(0.008, 0.03, "y"), ["controls"], {
  chan: ["rudder"],
  parent: "rig:pul:ra",
  pos: [0, 0, 0.05],
  color: STEEL,
});
// bellcranks on the surfaces
{
  const pv = surfacePivot("elevR"),
    c = ELEV_HORN.c;
  part(() => box(0.02, ELEV_HORN.arm, 0.02), ["controls"], {
    parent: "surf:elevR",
    pos: [c[0] - pv[0], c[1] - ELEV_HORN.arm / 2 - pv[1], c[2] - pv[2]],
    color: CTL,
    name: "Elevator bellcrank",
    note: "Between the elevator halves; the push-pull tube from the aft sector pulley drives it.",
    pin: true,
  });
  part(() => cyl(0.014, 0.2, "z"), ["controls"], {
    parent: "surf:elevR",
    pos: [c[0] - pv[0], c[1] - pv[1], c[2] - pv[2]],
    color: STEEL,
    name: "Elevator torque tube (tail)",
    note: "Joins the two elevator halves on the hinge line.",
  });
  const rv = surfacePivot("rudder"),
    r = RUD_HORN_AFT.c;
  part(() => box(0.02, 0.02, RUD_HORN_AFT.arm), ["controls"], {
    parent: "surf:rudder",
    pos: [r[0] - rv[0], r[1] - rv[1], RUD_HORN_AFT.arm / 2 - rv[2]],
    color: CTL,
    name: "Rudder bellcrank",
    note: "Horn at the bottom of the rudder; the push-pull tube from the aft rudder sector drives it.",
    pin: true,
  });
  [1, -1].forEach((sd) => {
    const key = "ail" + (sd > 0 ? "R" : "L"),
      av = surfacePivot(key);
    const hz = wingP(sd * AIL_DRIVE.z, 0.75, 0);
    part(() => box(0.012, AIL_DRIVE.arm, 0.012), ["controls"], {
      chan: ["aileron"],
      parent: "surf:" + key,
      pos: [hz.x - av[0], hz.y + AIL_DRIVE.arm / 2 - av[1], hz.z - av[2]],
      color: CTL,
      name: "Aileron conical drive arm",
      note: "Right-angle drive: the arm on the aileron hinge that the wing sector's crank turns.",
    });
    part(() => box(0.012, 0.012, AIL_DRIVE.crank), ["controls"], {
      chan: ["aileron"],
      parent: "rig:pul:aw" + (sd > 0 ? "R" : "L"),
      pos: [0, AIL_DRIVE.lift, (sd * AIL_DRIVE.crank) / 2],
      color: STEEL,
      name: "Wing sector crank arm",
      note: "Swings fore-aft as the sector turns and drives the aileron's conical drive arm.",
    });
  });
}
// turnbuckles and cable guides. The elevator turnbuckles sit on each strand's long run up the tailcone (segment 4): elA's segment 3
// is the short wrap round the intermediate pulley, where they would sit inside the pulley wheel.
(
  [
    ["elA", 4, 0.25],
    ["elB", 4, 0.25],
    ["elA", 4, 0.35],
    ["elB", 4, 0.35],
    ["rudR", 2, 0.3],
    ["rudL", 2, 0.3],
  ] as [string, number, number][]
).forEach(([k, i, t], j) =>
  part(() => cyl(0.009, 0.07, "x"), ["controls"], {
    chan: chanOfKey(k),
    pos: alongCable(k, i, t),
    color: "#C9B98F",
    name: "Turnbuckle",
    note: "Sets cable tension; safety-wired after rigging.",
    pin: j === 0,
  }),
);
[1, -1].forEach((sd) =>
  [
    ["ailBal", sd > 0 ? 1 : 6],
    ["ail" + (sd > 0 ? "R" : "L"), 7],
  ].forEach(([k, i]) =>
    part(() => box(0.03, 0.03, 0.02), ["controls"], {
      chan: ["aileron"],
      pos: alongCable(k as string, i as number, 0.5),
      color: "#C9D0D5",
      name: "Cable guide",
      note: "Fairlead that keeps the aileron cable centred as it runs spanwise (the clips drawn in POH Fig. 7-2).",
      pin: sd > 0 && k === "ailBal",
    }),
  ),
);

/* Cable retainers and fixed travel stops: AMM 12137-002 27-10 / 27-30 p. 1. */
Object.entries(PULLEYS).forEach(([key, d]) => {
  const chan = key.startsWith("a") ? ["aileron"] : key.startsWith("r") ? ["rudder"] : ["elevator"];
  part(() => box(0.012, 0.014, 0.045), ["controls"], {
    chan: chan as ("aileron" | "rudder" | "elevator")[],
    // Vertical-axis wing sectors need a radial keeper in the x-z plane, inside the wing.
    pos: d.axis === "y" ? [d.c[0] + d.r + 0.009, d.c[1], d.c[2]] : [d.c[0], d.c[1] - d.r - 0.009, d.c[2]],
    color: STEEL,
    name: "Pulley cable retainer",
    note: "Keeper prevents the control cable leaving its pulley and fouling adjacent hardware (AMM 12137-002 27-10 / 27-30 p. 1). Clearance and dimensions illustrative.",
  });
});
for (const key of ["awL", "awR", "ea"]) {
  const d = PULLEYS[key];
  for (const side of [-1, 1])
    part(() => box(0.016, 0.02, 0.018), ["controls"], {
      chan: key === "ea" ? ["elevator"] : ["aileron"],
      pos: [d.c[0] + side * (d.r + 0.014), d.c[1], d.c[2]],
      color: "#C7A774",
      name: "Primary control travel stop",
      note:
        key === "ea"
          ? "Fixed elevator empennage-bellcrank stops bound primary elevator travel (AMM 27-30 p. 1). Locations illustrative."
          : "Adjustable stops at each aileron actuation pulley limit primary surface travel (AMM 27-10 p. 1). Locations illustrative.",
    });
}
