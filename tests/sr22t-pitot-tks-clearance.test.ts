// RH feed is a regression guard: POH 13772-007 7-68 specifies only a LH pitot mast.
/** POH 13772-007 7-68/7-69, Fig 7-16; AMM 13773-002 Rev 7 ch. 34-10 PDF 1628,
 * 30-00 PDF 1167–1168, Fig 30-07-2 PDF 1220–1223: the routings are undimensioned.
 * The 2 mm surface gap is a schematic display requirement, not an aircraft specification.
 * Query the entire rendered tube meshes, including bends and endpoints, rather than waypoint distances. */
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { expect, it } from "vitest";
import { CAT } from "@/aircraft/sr22t/parts";

it.each(["Left", "Right"])("pitot heater wiring clears %s TKS wing feed tubes by 2 mm", (side) => {
  const wires = CAT.parts.filter((p) => p.name === "Pitot heater wiring");
  const feeds = CAT.parts.filter(
    (p) => p.name === `${side} outboard panel feed line` || p.name === `${side} inboard panel feed line`,
  );
  expect(wires).toHaveLength(1);
  expect(feeds).toHaveLength(2);
  const wire = wires[0].geo();
  const tree = new MeshBVH(wire);
  try {
    for (const feed of feeds) {
      const tube = feed.geo();
      try {
        const matrix = new THREE.Matrix4().makeTranslation(...(feed.pos ?? [0, 0, 0]));
        const gap = tree.closestPointToGeometry(tube, matrix)!.distance;
        console.info(`${feed.name}: ${(gap * 1000).toFixed(3)} mm surface gap`);
        expect.soft(tree.intersectsGeometry(tube, matrix), feed.name).toBe(false);
        expect.soft(gap, feed.name).toBeGreaterThanOrEqual(0.002);
      } finally {
        tube.dispose();
      }
    }
  } finally {
    wire.dispose();
  }
});
