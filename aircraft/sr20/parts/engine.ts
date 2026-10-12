/** SR20 G6 IO-390-C3B6 core. POH 11934-005 7-33–7-40; AMM 12137-002 71-00, 61-10. Geometry approximate. */
import * as THREE from "three";
import { box, cyl, mergeGeos } from "@/lib/geometry";
import { CRANK_Y, CYLS, PROP } from "../engine-anchors";
import { altAnim, part } from "./catalogue";

export { CYLS, PROP, MUFFLER, OIL_FILTER } from "../engine-anchors";

const bladeGeo = () => {
  const sh = new THREE.Shape();
  sh.moveTo(-0.06, 0.12);
  sh.quadraticCurveTo(-0.09, 0.5, -0.045, 0.94);
  sh.lineTo(0.03, 0.94);
  sh.quadraticCurveTo(0.075, 0.5, 0.06, 0.12);
  sh.lineTo(-0.06, 0.12);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: false });
  g.translate(0, 0, -0.009);
  g.rotateY(Math.PI / 2);
  return g;
};
for (let i = 0; i < 3; i++)
  part(bladeGeo, ["propeller", "engine"], {
    parent: "blade:" + i,
    color: "#3A4148",
    name: "Propeller blade",
    note: "Hartzell three-blade constant-speed, non-feathering propeller. Standard HC-E3YR-1RF/F7392S-1 metal propeller: 74 in. nominal diameter; composite option 3C1-R919A1/76C03-2 (POH 2-8, 7-40; AMM 61-00 p. 1). Shape approximate.",
    ext: true,
    groups: [],
  });
part(() => cyl(0.09, 0.17, "x"), ["propeller", "engine"], {
  pos: PROP,
  color: "#8C969E",
  name: "Propeller hub / pitch piston",
  ext: true,
  note: "The hub supports three blades and contains a hydraulic pitch-change piston, rod and fork. Governor oil drives high pitch; the spring and centrifugal twisting moment drive low pitch as oil drains (AMM 61-10 p. 1). Simplified external envelope; this does not depict measured internal hardware.",
  pin: true,
  groups: ["oil"],
});
part(() => box(0.78, 0.26, 0.26), ["engine"], {
  pos: [3.14, -0.16, 0],
  name: "Lycoming IO-390-C3B6",
  note: "Normally aspirated, four-cylinder horizontally opposed, air-cooled, wet-sump, continuous-flow fuel injection. 215 hp at 2,700 RPM; published 2,200-hour TBO may be eligible for extension under Lycoming SI 1009 (POH 7-33; AMM 71-00 p. 1). Installation geometry approximate.",
  pin: true,
  groups: [],
});
part(() => box(0.105, 0.255, 0.28), ["engine"], {
  pos: [2.785, -0.16, 0],
  color: "#646E75",
  name: "Rear accessory housing",
  note: "Engine-driven magnetos and the oil-system and fuel-system accessories are shown at the rear of the IO-390 installation (AMM Fig 71-00-1, 74-00 p. 1, 79-00 p. 1). Housing and mounting positions approximate.",
  groups: [],
});
part(() => cyl(0.052, 0.22, "x"), ["engine", "propeller"], {
  pos: [3.61, CRANK_Y, 0],
  color: "#68757D",
  name: "Crankshaft / propeller flange",
  note: "The engine drives the propeller directly; the governor controls blade angle rather than a gearbox ratio (Lycoming IOM-IO-390-C Jan 2017 System Description p. 1; POH 7-40). Representative crankshaft nose and flange, dimensions approximate.",
  groups: [],
});
CYLS.forEach((c) => {
  const parent = "cyl:" + c.n;
  part(() => cyl(0.085, 0.2, "z", 18), ["engine"], {
    parent,
    color: "#7C858C",
    name: "Cylinder " + c.n,
    note:
      (c.s > 0 ? "Right" : "Left") +
      " bank of the four-cylinder IO-390. Fins transfer heat to the baffled airflow; no movable cowl flaps (POH 7-40). Schematic fin and cylinder dimensions.",
    groups: [],
  });
  for (let k = -2; k <= 2; k++)
    part(() => cyl(0.1, 0.01, "z", 18), ["engine"], {
      parent,
      pos: [0, 0, k * 0.035],
      color: "#8C959C",
      groups: [],
    });
  part(() => box(0.19, 0.19, 0.07), ["engine"], {
    parent,
    pos: [0, 0, c.s * 0.13],
    color: "#6A737A",
    name: "Cylinder head " + c.n,
    note: "Two spark plugs per head, one CHT sensor, individual intake and exhaust ports (POH 7-37–7-40). Shape approximate.",
    groups: [],
  });
  part(() => box(0.155, 0.145, 0.022), ["engine"], {
    parent,
    pos: [0, 0, c.s * 0.174],
    color: "#596970",
    name: "Rocker cover — cyl " + c.n,
    note: "Representative outer cover of the cylinder valve gear (Lycoming IOM-IO-390-C Jan 2017 System Description p. 1, Fig 2). Shape and placement approximate.",
    groups: [],
  });
  part(
    () => mergeGeos([-1, 1].map((side) => cyl(0.009, 0.18, "z").translate(side * 0.053, -0.078, -c.s * 0.023))),
    ["engine"],
    {
      parent,
      color: "#B0B6B7",
      name: "Pushrod housings — cyl " + c.n,
      note: "Representative paired pushrod housings below the cylinder, connecting crankcase valve gear to the head (Lycoming IOM-IO-390-C Jan 2017 System Description p. 1, Fig 2; MM-IO-390-C 72-30). Dimensions and routing approximate.",
      groups: [],
    },
  );
});
part(() => cyl(0.07, 0.12, "x"), ["electrical", "engine"], {
  pos: [3.5, -0.3, 0.22],
  color: "#D9960F",
  anim: altAnim("alt1"),
  name: "ALT 1 — 100 A",
  note: "Belt-driven, right front. Regulated to 27.7 V. Feeds Main Distribution Bus 1 (POH 7-48–7-49). Geometry approximate.",
  pin: true,
  groups: [],
});
part(() => cyl(0.06, 0.11, "x"), ["electrical", "engine"], {
  pos: [3.5, -0.3, -0.22],
  color: "#D9960F",
  anim: altAnim("alt2"),
  name: "ALT 2 — 70 A",
  note: "Belt-driven, left front. Regulated to 28.7 V, so it carries the loads shared with ALT 1 (POH 7-48–7-49). Geometry approximate.",
  pin: true,
  groups: [],
});
