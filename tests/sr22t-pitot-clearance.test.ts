/** POH 13772-007 7-68–7-71, Fig 7-16; AMM 13773-002 Rev 7 Fig 34-10-1 sheet 4
 * (PDF 1648), Fig 30-07-2 sheet 4 Detail C (PDF 1220): routing is undimensioned.
 * The 2 mm clearance is an approximate schematic display requirement, not an aircraft dimension. */
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { expect, it } from "vitest";
import { CAT, TANK_SPAN, TANK_CHORD, NOSE_GEAR, NOSE_CASTER, YOKES, YOKE_X, YOKE_Y } from "@/aircraft/sr22t/parts";
import { FW, doorHinge, wingSec, loft } from "@/aircraft/sr22t/geometry";
import { ETT, AIL_SECTOR, RUD_HORN, CARR, PULLEYS } from "@/aircraft/sr22t/rig";
import { toV, type Vec3 } from "@/lib/math";

// Closed doors and neutral controls, matching the renderer's rest transforms.
const parents: Record<string, THREE.Matrix4> = {};
const translate = (v: Vec3 | THREE.Vector3) => new THREE.Matrix4().makeTranslation(toV(v));
for (const [name, v] of Object.entries({
  "rig:ett": ETT.c,
  "rig:ailSector": AIL_SECTOR.c,
  "rig:rudHorn": RUD_HORN.c,
  noseGear: NOSE_GEAR,
  caster: toV(NOSE_GEAR).add(toV(NOSE_CASTER)),
}))
  parents[name] = translate(v);
for (const key of ["L", "R", "bag"] as const) parents[`door:${key}`] = translate(doorHinge(key).pivot);
for (const surface of CAT.surfaces) parents[`surf:${surface.key}`] = translate(surface.pivot);
for (const [key, pulley] of Object.entries(PULLEYS)) parents[`rig:pul:${key}`] = translate(pulley.c);
parents["rig:pedL"] = parents["rig:pedR"] = new THREE.Matrix4();
for (const yoke of YOKES)
  parents[`yoke:${yoke.side}`] = parents[`grip:${yoke.side}`] = translate([YOKE_X, YOKE_Y, yoke.z]);
for (const side of [-1, 1]) parents[`rig:carr:${side < 0 ? "L" : "R"}`] = translate([CARR.x, CARR.y, side * CARR.z]);

type Solid = Pick<(typeof CAT.parts)[number], "geo" | "name" | "pos" | "rot" | "scale" | "parent">;
const solids: Solid[] = [
  ...CAT.parts,
  ...CAT.surfaces.map((s) => ({ name: s.name, geo: s.geo, pos: s.pivot })),
  // Full wet-wing volume matches Airplane.tsx/Tanks, independent of fuel quantity.
  ...[-1, 1].map((side) => ({
    name: `${side < 0 ? "Left" : "Right"} wing tank`,
    geo: () => {
      const sections = [TANK_SPAN[0], 1.6, 2.4, 3.2, 4, TANK_SPAN[1]].map((z) =>
        wingSec(side * z, ...TANK_CHORD, 0.85),
      );
      return loft(side < 0 ? sections.map((r) => r.reverse()) : sections);
    },
  })),
];

it("pitot heater wiring clears the valve, spar and unrelated cabin/wing solids by 2 mm", () => {
  const wires = CAT.parts.filter((p) => p.name === "Pitot heater wiring");
  expect(wires).toHaveLength(1);
  const wire = wires[0].geo();
  const tree = new MeshBVH(wire);
  wire.computeBoundingBox();
  const envelope = wire.boundingBox!.clone().expandByScalar(0.002);
  const checked = new Set<string>();
  // Connected terminals: POH Fig 7-16 current sensor; AMM Fig 34-10-1 Detail E mast bracket.
  const terminals = new Set(["Pitot heater wiring", "Pitot heat current sensor", "Pitot mast"]);
  try {
    for (const part of solids) {
      if (terminals.has(part.name ?? "")) continue;
      // Cylinder- and propeller-parented parts belong to the excluded engine bay.
      if (part.parent?.startsWith("cyl:") || part.parent?.startsWith("blade:")) continue;
      const geo = part.geo();
      try {
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(...(part.pos ?? [0, 0, 0])),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rot ?? [0, 0, 0]))),
          new THREE.Vector3(...(part.scale ?? [1, 1, 1])),
        );
        if (part.parent) {
          expect(parents[part.parent], `missing rest transform: ${part.parent}`).toBeDefined();
          matrix.premultiply(parents[part.parent]);
        }
        geo.computeBoundingBox();
        const bounds = geo.boundingBox!.clone().applyMatrix4(matrix);
        if (bounds.min.x >= FW) continue; // cabin + wings only; engine-bay parts are out of scope
        checked.add(part.name ?? "unnamed");
        if (
          !envelope.intersectsBox(bounds) &&
          !/3-way control valve|Main spar|^(Left|Right) (inboard|outboard) panel feed line$/.test(part.name ?? "")
        )
          continue;
        geo.boundsTree = new MeshBVH(geo);
        const closest = tree.closestPointToGeometry(geo, matrix)!;
        const gap = closest.distance;
        if (gap < 0.02 || /3-way control valve|Main spar|panel feed line/.test(part.name ?? ""))
          console.info(
            `${part.name}: ${(gap * 1000).toFixed(3)} mm at ${closest.point.toArray().map((v) => v.toFixed(3))}`,
          );
        expect.soft(tree.intersectsGeometry(geo, matrix), `${part.name}: intersection`).toBe(false);
        expect.soft(gap, `${part.name}: surface clearance`).toBeGreaterThanOrEqual(0.002);
      } finally {
        geo.dispose();
      }
    }
    for (const name of [
      "3-way control valve",
      "Main spar",
      "Left inboard panel feed line",
      "Left outboard panel feed line",
      "Right inboard panel feed line",
      "Right outboard panel feed line",
    ])
      expect(checked.has(name), `${name} must be checked`).toBe(true);
  } finally {
    wire.dispose();
  }
}, 120000);
