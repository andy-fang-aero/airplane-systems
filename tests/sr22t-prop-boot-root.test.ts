/** AMM 13773-002 Rev 7 Fig 30-60-1 item 14, PDF 1267: boots seat on the blade roots outside the spinner. */
// World-space boot guards exercise future spinner placement changes independently of the feed-tube fix.
import * as THREE from "three";
import { it, expect } from "vitest";
import { CAT, PROP } from "@/aircraft/sr22t/parts";
import { points, tris, inside } from "./mesh-clearance";
const spinner = () => CAT.shells.find((s) => s.name === "Spinner")!.geo();
const parts = (name: string) => CAT.parts.filter((p) => p.name === name);
it.each([0, 1, 2])("boot %i root is outside the spinner in world space (AMM Fig 30-60-1 item 14)", (blade) => {
  const dome = spinner();
  dome.computeBoundingBox();
  const skin = tris(dome, new THREE.Matrix4());
  const boot = parts("Grooved blade boot").find((p) => p.parent === `blade:${blade}`)!;
  const g = boot.geo();
  const m = new THREE.Matrix4().makeRotationX((blade * Math.PI * 2) / 3);
  m.setPosition(...PROP);
  m.multiply(new THREE.Matrix4().makeTranslation(...boot.pos!));
  const vertices = points(g, m);
  // Test the entire innermost edge, including its aft face, against the actual spinner mesh.
  const local = points(g, new THREE.Matrix4());
  const root = Math.min(...local.map((p) => p.y));
  const edge = vertices.filter((_, i) => Math.abs(local[i].y - root) < 1e-6);
  expect(edge.length).toBeGreaterThan(0);
  for (const p of edge) expect(inside(p, skin, dome.boundingBox!)).toBe(false);
  g.dispose();
  dome.dispose();
});
