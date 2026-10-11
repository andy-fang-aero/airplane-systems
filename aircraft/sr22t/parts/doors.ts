/** Door hardware: POH 13772-007 7-31/7-26; AMM 13773-002 Rev 7 ch. 52.
 * Hardware sizes/attachment coordinates are illustrative, scaled from the cited figures. */
import * as THREE from "three";
import { mats, skinMat } from "@/lib/materials";
import { useView } from "@/lib/view";
import { toVec3 } from "@/lib/math";
import {
  BAG_DOOR,
  BAG_HINGE,
  DOOR_HINGE,
  DOOR_HINGE_MOUNTS,
  DOOR_OPENING,
  box,
  cyl,
  sph,
  onSkin,
  paintSkin,
  tubeGeo,
  doorEdge,
  doorCutParam,
  doorParam,
  doorSkin,
  doorHinge,
  doorPanelGeo,
  doorPoint,
  doorWindowGeo,
  fus,
  type DoorKey,
} from "../geometry";
import { live } from "../model";
import { useSR22T } from "../store";
import { part } from "./catalogue";

// The acrylic window is visible from both sides, including the cabin inspection cameras.
const doorGlass = mats("#354C5A").on.clone();
doorGlass.side = THREE.DoubleSide;

/** Exterior livery stays on front faces; the cabin sees plain trim, not reversed pinstripes.
 * Interior finish is cosmetic/illustrative (AMM Fig 52-10-8, PDF 2046). */
export function plainDoorInterior(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\nif (!gl_FrontFacing) diffuseColor = vec4(diffuse, opacity);",
    );
  };
  material.customProgramCacheKey = () => "sr22t-door-interior";
  return material;
}
let paintedDoor: THREE.MeshStandardMaterial | undefined;
const doorMaterial = () => (paintedDoor ??= plainDoorInterior(skinMat(paintSkin).clone()));

function riding(
  key: DoorKey,
  geo: () => THREE.BufferGeometry,
  name: string,
  note: string,
  color = "#D9DEE1",
  pin = true,
  ext = false,
) {
  const { pivot } = doorHinge(key);
  part(() => geo().translate(-pivot.x, -pivot.y, -pivot.z), ["doors"], {
    name,
    note,
    parent: "door:" + key,
    color,
    pin,
    ext,
    fairing: ["Left cabin door", "Right cabin door", "Baggage door", "Door window"].includes(name),
    anim: ["Left cabin door", "Right cabin door", "Baggage door", "Door window"].includes(name)
      ? (m) => {
          const v = useView.getState();
          if (!v.xray && v.focus !== name) m.material = name === "Door window" ? doorGlass : doorMaterial();
        }
      : undefined,
  });
}
function at(
  key: DoorKey,
  p: THREE.Vector3,
  geo: () => THREE.BufferGeometry,
  name: string,
  note: string,
  color?: string,
  ext = false,
) {
  riding(key, () => geo().translate(p.x, p.y, p.z), name, note, color, true, ext);
}
const point = (x: number, y: number, side: number, inward = 0) => {
  const p = onSkin(x, y, side, 1);
  p.z -= side * inward;
  return p;
};
/** Outward unit loft normal at a skin point, from its surface (x, q) tangents; q is free of the roof-wrap singularity. */
export function skinNormal(p: THREE.Vector3, side: number) {
  const { x, y: q } = doorParam(p),
    h = 0.002;
  const n = doorSkin(x + h, q, side)
    .sub(doorSkin(x - h, q, side))
    .cross(doorSkin(x, q + h, side).sub(doorSkin(x, q - h, side)))
    .normalize();
  return n.dot(p.clone().sub(new THREE.Vector3(x, fus(x).cy, 0))) < 0 ? n.negate() : n;
}
/** Centre of an axis-aligned box of half-extents `half` whose outer face sits `recess` inboard of the skin at (x, y).
 * recess 0 is flush exterior hardware; a positive recess keeps interior hardware wholly inside the skin. */
export function seated(x: number, y: number, side: number, half: readonly [number, number, number], recess = 0) {
  const p = onSkin(x, y, side, 1),
    n = skinNormal(p, side);
  return p.addScaledVector(n, -(Math.abs(n.x) * half[0] + Math.abs(n.y) * half[1] + Math.abs(n.z) * half[2] + recess));
}
/** Interior hardware sits this far inside the closed skin: 1 mm of skin-QA flush tolerance plus 1 mm for the box
 * corners on the curved loft. Illustrative, not a published installation dimension. */
export const INBOARD = 0.002;
/** Fixed forward bracket height: low enough on the forward jamb that the strut lengthens from the first degree of
 * opening about the pocketed hinge axis (gas strut assists opening, POH 7-31). Fig 52-10-1 sheet 1 is undimensioned. */
const STRUT_FIXED_Y = 0.08;
/** Fixed forward bracket and moving aft bracket (Fig 52-10-1 sheet 1, PDF 2011), coordinates approximate. */
export function strutEnds(side: number, fraction: number) {
  return {
    fixed: point(1.85, STRUT_FIXED_Y, side, 0.15),
    moving: doorPoint(side < 0 ? "L" : "R", point(1.5, -0.05, side, 0.025), fraction),
  };
}
/** Forward-jamb return arm, from the fixed flange beside the cut edge to the fixed ball bracket.
 * AMM 13773-002 Rev 7 Fig 52-10-1 sheet 1, PDF 2011; dimensions approximate. */
export function strutMount(side: number) {
  const q = doorParam(onSkin(1.85, STRUT_FIXED_Y, side, 1)).y;
  const loop = doorCutParam(side < 0 ? "L" : "R");
  const crossings = loop.flatMap((a, i) => {
    const b = loop[(i + 1) % loop.length];
    return (a.y <= q && b.y >= q) || (b.y <= q && a.y >= q)
      ? [THREE.MathUtils.lerp(a.x, b.x, (q - a.y) / (b.y - a.y))]
      : [];
  });
  // The 40-mm illustrative foot lies on fixed skin, clear of the moving panel and seal.
  return doorSkin(Math.max(...crossings) + 0.04, q, side);
}
/** Door armrest box (POH 7-31); dimensions approximate. */
export const ARMREST_SIZE = [0.32, 0.035, 0.1] as const;
export const armrestCentre = (side: number) => point(1.3, -0.065, side, 0.07);
/** Interior lever swing from latched to unlatched about the door-normal (z) axis; travel approximate. */
export const INTERIOR_LEVER_TRAVEL = Math.PI / 3;
/** Interior handle lever (AMM 13773-002 Rev 7 Fig 52-10-3 item 1, PDF 2027; 52-10 PDF 2006): the hub is at the lever's
 * aft end with the grip running forward (FWD arrow), so lifting the lever raises its forward end. Latched, it lies along
 * the armrest top, 2 mm clear; unlatched, it swings up out of the armrest. Grip centre kept under the window as before. */
export function interiorLever(side: number) {
  const size = [0.13, 0.017, 0.018] as const;
  const top = armrestCentre(side).y + ARMREST_SIZE[1] / 2;
  return {
    hub: point(1.16, top + 0.002 + size[1] / 2, side, 0.042),
    geo: () => box(...size).translate(size[0] / 2, 0, 0),
  };
}

function span(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  mesh.position.copy(a).lerp(b, 0.5);
  const d = b.clone().sub(a);
  mesh.scale.y = d.length();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}
for (const side of [-1, 1]) {
  const key = side < 0 ? "L" : "R",
    { upper, lower } = DOOR_HINGE(side);
  const note =
    "Forward-hinged cabin door with gas-strut assistance (POH 13772-007 7-31). Opening fitted to POH Fig 1-2, 1-5 (PDF 15); outline/roof wrap scaled from AMM Fig 52-10-8 (PDF 2046). Hinge coordinates and 70° full-open angle approximate. Edge clearance: AMM Fig 52-10-2 (PDF 2016), 0.060–0.125 in.";
  riding(key, () => doorPanelGeo(key), side < 0 ? "Left cabin door" : "Right cabin door", note, "#F3F5F6");
  riding(
    key,
    () => doorWindowGeo(side),
    "Door window",
    "Acrylic door window; moves with the door. Emergency egress hammer: POH 7-94; AMM Fig 52-10-8 (PDF 2046).",
    "#354C5A",
  );
  // 3-mm tube centred 7 mm in along the loft normal: on the jamb flange, inside the closed skin.
  const seal = doorEdge(key).map((p) => p.clone().addScaledVector(skinNormal(p, side), -0.007));
  riding(
    key,
    () => tubeGeo([...seal, seal[0]], 0.003),
    "Door seal",
    "Perimeter seal and foam strip (AMM Fig 52-10-8, PDF 2046), on the jamb inside the closed skin. Thickness approximate.",
    "#363A3D",
  );
  for (const [name, p] of [
    ["Upper door hinge", upper],
    ["Lower door hinge", lower],
  ] as const)
    part(
      () =>
        tubeGeo(
          [
            p.clone().addScaledVector(doorHinge(key).axis, -0.0275),
            p.clone().addScaledVector(doorHinge(key).axis, 0.0275),
          ],
          0.014,
        ),
      ["doors"],
      {
        name,
        pin: true,
        color: "#85939C",
        note: "Forward-edge hinge pin in its fuselage bracket, recessed in a pocket of the skin ahead of the door (AMM Fig 52-10-1 sheet 3 Details C/D, PDF 2013). Undimensioned: the pin offset from the door corner is fitted to keep it inside the skin while the panel clears the hull through the swing; offset/size approximate.",
      },
    );
  const mounts = DOOR_HINGE_MOUNTS(side);
  for (const name of ["upper", "lower"] as const) {
    riding(
      key,
      // The 8-mm plate starts 9 mm in along the loft normal, under the flush hinge plate cover.
      () =>
        tubeGeo(
          [mounts[name].clone().addScaledVector(skinNormal(mounts[name], side), -0.009), DOOR_HINGE(side)[name]],
          0.008,
        ),
      "Door hinge plate",
      "Door-side hinge plate and rod end reaching forward to the recessed pin, under the hinge plate cover on the door skin (AMM Fig 52-10-1 sheet 3 Details C/D, PDF 2013). Inside the closed skin; offset/size approximate.",
    );
  }
  // Fig 52-10-3 draws the exterior lever lying in the housing's recess, flush with the door skin: the lever face is on
  // the skin and the housing floor 2 mm below it (recess depth undimensioned, approximate).
  const LEVER = [0.12, 0.017, 0.018] as const;
  at(
    key,
    seated(1.27, 0.02, side, [0.08, 0.019, 0.006], 0.002),
    () => box(0.16, 0.038, 0.012),
    "Exterior handle housing",
    "Flush exterior handle housing, recessed into the door skin (AMM 52-10 PDF 2006; Fig 52-10-3 PDF 2027). Size and recess depth approximate.",
    "#667079",
    true,
  );
  // AMM 13773-002 Rev 7 Fig 52-10-3 (PDF 2027): exterior hub at the forward
  // end; the grip extends aft and rises on release, ending short of the lock cylinder.
  // The illustrative 120 mm length leaves an 8 mm gap without moving the hub or lock.
  for (const inside of [false, true]) {
    const pivot = doorHinge(key).pivot;
    const lever = interiorLever(side);
    part(() => (inside ? lever.geo() : box(...LEVER).translate(-LEVER[0] / 2, 0, 0)), ["doors"], {
      parent: "door:" + key,
      pos: toVec3(
        (inside ? lever.hub : seated(1.345, 0.02, side, [LEVER[0] / 2, LEVER[1] / 2, LEVER[2] / 2])).sub(pivot),
      ),
      pin: true,
      ext: !inside,
      name: inside ? "Interior door handle" : "Exterior door handle",
      color: "#B8C4CC",
      note: "Pull cable/linkage operates the slam catch and draw-in latch. Exterior lever lies flush in its housing recess and rotates upward; interior lever nests in the armrest when latched and juts into the forearm when unlatched (AMM 52-10 PDF 2006; Fig 52-10-3 PDF 2027). Lever travel approximate.",
      anim: (m) => {
        const latched = useSR22T.getState().s.doors[key] === "latched";
        m.rotation.z = latched ? 0 : inside ? INTERIOR_LEVER_TRAVEL : -Math.PI / 3;
      },
    });
  }
  at(
    key,
    seated(1.205, 0.02, side, [0.012, 0.012, 0.01]),
    () => cyl(0.012, 0.02, "z"),
    "Door lock cylinder",
    "Exterior key lock at the aft end of the handle housing, face flush with the door skin (AMM 13773-002 Rev 7 Fig 52-10-3 PDF 2027; Fig 52-10-5 PDF 2031); cabin and baggage keys interchange (POH 7-31/7-26). Cannot be locked from inside and does not hinder escape from within (AMM 52-10 PDF 2006). Size approximate.",
    undefined,
    true,
  );
  at(
    key,
    armrestCentre(side),
    () => box(...ARMREST_SIZE),
    "Door armrest",
    "Front-seat armrest integrated with the door (POH 7-31); handle nestled in armrest when latched (AMM 52-10 PDF 2006). Dimensions approximate.",
    "#525C65",
  );
  for (const y of [-0.105, 0.62]) {
    const opening = DOOR_OPENING(side);
    const aftX = THREE.MathUtils.lerp(opening[3].x, opening[2].x, (y - opening[3].y) / (opening[2].y - opening[3].y));
    at(
      key,
      seated(aftX + 0.04, y, side, [0.0135, 0.017, 0.014], INBOARD),
      () => box(0.027, 0.034, 0.028),
      "Door latch",
      "Upper/lower aft latches engage frame receptacles/striker pins (POH 7-31; AMM 52-00 PDF 2004, Fig 52-10-6 PDF 2037). Inside the closed skin; size approximate.",
    );
    const striker = seated(aftX - 0.012, y, side, [0.02, 0.007, 0.007], INBOARD);
    part(() => cyl(0.007, 0.04, "x").translate(striker.x, striker.y, striker.z), ["doors"], {
      name: "Striker pin",
      pin: true,
      note: "Fixed jamb latch stud, inside the closed skin (AMM Fig 52-10-6 PDF 2037). Location/size approximate.",
    });
  }
  const ends = strutEnds(side, 0);
  part(
    () => {
      // The flange is inside the jamb: start the 8-mm arm with its surface 1 mm inside the skin.
      const foot = strutMount(side).addScaledVector(skinNormal(strutMount(side), side), -0.009);
      const elbow = foot.clone().add(new THREE.Vector3(0, 0, -side * 0.04));
      return tubeGeo([foot, elbow, ends.fixed], 0.008, 0);
    },
    ["doors"],
    {
      name: "Gas strut jamb return arm",
      pin: true,
      note: "Connects the forward door-frame flange to the fixed gas-strut bracket (AMM 13773-002 Rev 7 Fig 52-10-1 sheet 1, PDF 2011). Arm shape, 8-mm radius and 40-mm inboard return illustrative; foot lies 40 mm forward of the cut edge, clear of the moving panel/seal (POH Fig 1-2, PDF 15); placement approximate.",
    },
  );
  part(() => box(0.035, 0.027, 0.026).translate(ends.fixed.x, ends.fixed.y, ends.fixed.z), ["doors"], {
    name: "Gas strut forward bracket",
    pin: true,
    note: "Fixed fuselage forward attachment (AMM Fig 52-10-1 sheet 1 PDF 2011); size/location approximate.",
  });
  at(
    key,
    ends.moving,
    () => box(0.035, 0.027, 0.026),
    "Gas strut aft bracket",
    "Moving door aft attachment (AMM Fig 52-10-1 sheet 1 PDF 2011); size/location approximate.",
  );
  part(() => sph(0.011).translate(ends.fixed.x, ends.fixed.y, ends.fixed.z), ["doors"], {
    name: "Gas strut forward ball fitting",
    note: "Frame ball fitting and rod end (AMM Fig 52-10-1 sheet 1 Detail A, PDF 2011); size/position approximate.",
  });
  at(
    key,
    ends.moving,
    () => sph(0.011),
    "Gas strut aft ball fitting",
    "Door ball fitting and rod end (AMM Fig 52-10-1 sheet 1 Detail A, PDF 2011); size/position approximate.",
  );
  for (const barrel of [true, false]) {
    part(() => cyl(barrel ? 0.013 : 0.006, 1), ["doors"], {
      name: barrel ? "Door gas strut" : "Gas strut piston",
      pin: barrel,
      color: barrel ? "#404C54" : "#D3DBDF",
      note: "Gas strut between fixed forward and moving aft attachment brackets; assists opening and holds door against gusts (POH 7-31; AMM Fig 52-10-1 sheet 1 PDF 2011). Bracket coordinates/stroke and 0.27-m barrel length approximate.",
      anim: (m) => {
        const { fixed, moving } = strutEnds(side, live.doors[key]);
        // The barrel stays rigid on the door end; only the exposed piston length changes.
        const middle = moving.clone().lerp(fixed, 0.27 / fixed.distanceTo(moving));
        span(m, barrel ? middle : fixed, barrel ? moving : middle);
      },
    });
  }
}
riding(
  "bag",
  () => doorPanelGeo("bag"),
  "Baggage door",
  "Left, aft of the wing, forward-hinged and aft-latched (POH 7-26). 21.0 × 20.0 in opening (POH Fig 1-2 PDF 15). AMM Fig 52-30-1 sheet 1 PDF 2055 applies to the modelled airplane: lanyard, no gas strut. Top flat 10.5 in; forward chamfer drop 5.0 in (POH Fig 1-2 PDF 15). Placement, corner radii and 70° opening angle approximate.",
  "#F3F5F6",
);
const bagSeal = BAG_DOOR.map((p) => p.clone().add(new THREE.Vector3(0, 0, 0.006)));
riding(
  "bag",
  () => tubeGeo([...bagSeal, bagSeal[0]], 0.003),
  "Baggage door seal",
  "Perimeter seal (AMM Fig 52-30-1 PDF 2055); thickness approximate.",
  "#363A3D",
);
part(() => tubeGeo([BAG_HINGE.lower, BAG_HINGE.upper], 0.009), ["doors"], {
  name: "Baggage door hinge",
  pin: true,
  ext: true,
  note: "Exterior forward-edge piano hinge, rod on the skin line (AMM Fig 52-30-1 sheet 1 PDF 2055). Size approximate.",
});
at(
  "bag",
  seated(-0.6, 0.025, -1, [0.012, 0.012, 0.01]),
  () => cyl(0.012, 0.02, "z"),
  "Baggage door lock",
  "Exterior key lock, face flush with the door skin, latched on rear edge. Key also fits the cabin doors (POH 7-26; AMM 52-30 PDF 2048, Fig 52-30-1 sheet 1 PDF 2055). Size approximate.",
  undefined,
  true,
);
at(
  "bag",
  seated(-0.59, -0.015, -1, [0.014, 0.03, 0.0125], INBOARD),
  () => box(0.028, 0.06, 0.025),
  "Baggage door latch",
  "Rear-edge latch, inside the closed skin (POH 7-26; AMM Fig 52-30-1 PDF 2055), size approximate.",
);
part(() => cyl(0.004, 1), ["doors"], {
  name: "Baggage door lanyard",
  pin: true,
  note: "Lanyard limits the swing on the modelled airplane; no baggage-door gas strut (AMM Fig 52-30-1 sheet 1 PDF 2055). Attachment coordinates/length approximate.",
  anim: (m) => span(m, point(-0.14, 0.17, -1, 0.02), doorPoint("bag", point(-0.45, 0.2, -1, 0.012), live.doors.bag)),
});
