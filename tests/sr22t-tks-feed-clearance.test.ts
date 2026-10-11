// The hub case is a regression guard; main already clears the AMM Fig 30-60-2 0.25 in. hub minimum (14.76 mm); the ring case fails on base
/** AMM 13773-002 Rev 7 Fig 30-60-2 "Feed Tube Alignment - Serials w/ Hartzell Propeller" (PDF 1270, note SR22_MM30_5041):
 * "Minimum clearance between feed tube and any portion of the slinger ring is 0.1 inch (2.54 mm)" and "... any portion of
 * the propeller hub is 0.25 inch (6.35 mm)". Checked over the model's illustrative blade-pitch sweep.
 *
 * Ring: the note makes no exception for the tube's inlet, so the whole tube mesh, inlet cross-section included, must clear
 * the ring mesh.
 *
 * Hub: the model has no propeller hub solid (Fig 30-60-1 Detail A, PDF 1267, is undimensioned). The proxy is an approximate
 * hub envelope: a cylinder on the propeller axis out to the innermost vertex of the modelled blade roots (the hub holds
 * the blade shanks), unbounded fore and aft, so it overstates the hub and the check errs on the safe side. Distances are
 * measured on the faceted meshes. */
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { expect, it } from "vitest";
import { CAT, PROP } from "@/aircraft/sr22t/parts";
import { initialSim, bladeDisplayPitch, type Sim } from "@/aircraft/sr22t/model";
import { useSR22T } from "@/aircraft/sr22t/store";
import { points } from "./mesh-clearance";

const SLINGER_MIN = 0.1 * 0.0254;
const HUB_MIN = 0.25 * 0.0254;

const blade = (i: number) =>
  new THREE.Matrix4().makeTranslation(...PROP).multiply(new THREE.Matrix4().makeRotationX((i * Math.PI * 2) / 3));
const pitch = (s: Sim) => new THREE.Matrix4().makeRotationY(bladeDisplayPitch(s));
const states = [
  ...Array.from({ length: 21 }, (_, i): Sim => ({ ...initialSim, eng: { ...initialSim.eng, lever: i / 20 } })),
  { ...initialSim, eng: { ...initialSim.eng, lever: 1, govFail: true } },
];
const tubes = (i: number) => CAT.parts.filter((p) => p.name === "Boot feed tube" && p.parent === `blade:${i}`);
const radial = (p: THREE.Vector3) => Math.hypot(p.y - PROP[1], p.z - PROP[2]);

/** World matrix of a feed tube mesh at sim state s, through its own anim (the hub p-clip pitch cancel). */
const tubeWorld = (part: (typeof CAT.parts)[number], mesh: THREE.Mesh, i: number, s: Sim) => {
  useSR22T.setState({ s });
  part.anim!(mesh, 0);
  mesh.updateMatrix();
  return blade(i).multiply(pitch(s)).multiply(mesh.matrix);
};

it("every boot feed tube, inlet included, clears the slinger ring by 0.1 in. (AMM Fig 30-60-2, PDF 1270)", () => {
  const saved = useSR22T.getState().s;
  const slinger = CAT.parts.filter((p) => p.name === "Propeller slinger ring");
  expect(slinger).toHaveLength(1);
  const rg = slinger[0].geo().translate(...slinger[0].pos!);
  const tree = new MeshBVH(rg);
  let min = Infinity;
  try {
    for (const i of [0, 1, 2]) {
      expect(tubes(i)).toHaveLength(1);
      const part = tubes(i)[0];
      const mesh = new THREE.Mesh(part.geo());
      try {
        for (const s of states) {
          const context = `blade ${i}, lever ${s.eng.lever}, govFail ${s.eng.govFail}`;
          const m = tubeWorld(part, mesh, i, s);
          // The slinger ring is placed by pos alone, so its world frame is the geometry's own.
          expect(tree.intersectsGeometry(mesh.geometry, m), context).toBe(false);
          const gap = tree.closestPointToGeometry(mesh.geometry, m)!.distance;
          expect(gap, context).toBeGreaterThanOrEqual(SLINGER_MIN);
          min = Math.min(min, gap);
        }
      } finally {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  } finally {
    useSR22T.setState({ s: saved });
    rg.dispose();
  }
  console.info(`Feed tube to slinger ring: minimum ${(min * 1000).toFixed(2)} mm`);
});

it("every boot feed tube clears the propeller hub envelope by 0.25 in. (AMM Fig 30-60-2, PDF 1270)", () => {
  const saved = useSR22T.getState().s;
  const blades = CAT.parts.filter((p) => p.name === "Propeller blade");
  expect(blades).toHaveLength(3);
  let min = Infinity;
  try {
    for (const s of states) {
      // Hub envelope radius: the innermost point of any modelled blade at this pitch.
      const hubR = Math.min(
        ...blades.flatMap((b) => {
          const g = b.geo();
          const r = points(g, blade(Number(b.parent!.split(":")[1])).multiply(pitch(s))).map(radial);
          g.dispose();
          return r;
        }),
      );
      expect(hubR).toBeGreaterThan(0.1);
      for (const i of [0, 1, 2]) {
        const part = tubes(i)[0];
        const mesh = new THREE.Mesh(part.geo());
        try {
          const context = `blade ${i}, lever ${s.eng.lever}, govFail ${s.eng.govFail}`;
          const gap = Math.min(...points(mesh.geometry, tubeWorld(part, mesh, i, s)).map(radial)) - hubR;
          expect(gap, context).toBeGreaterThanOrEqual(HUB_MIN);
          min = Math.min(min, gap);
        } finally {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      }
    }
  } finally {
    useSR22T.setState({ s: saved });
  }
  console.info(`Feed tube to hub envelope: minimum ${(min * 1000).toFixed(2)} mm`);
});
