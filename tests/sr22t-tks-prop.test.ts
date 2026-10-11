/** AMM 13773-002 Rev 7 30-60 pp. 2–3 (PDF 1259–1260), Fig 30-60-1 (PDF 1267):
 * tube above the second groove at full fine; hub p-clips per 61-10 p. 4 item (e), PDF 2441.
 * Pitch range is the existing illustrative model range, not a new aircraft limitation. */
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { expect, it } from "vitest";
import { CAT, PROP } from "@/aircraft/sr22t/parts";
import { initialSim, bladeDisplayPitch, type Sim } from "@/aircraft/sr22t/model";
import { useSR22T } from "@/aircraft/sr22t/store";
import { points, tris, inside } from "./mesh-clearance";

const pair = (blade: number) => ({
  tube: CAT.parts.find((p) => p.name === "Boot feed tube" && p.parent === `blade:${blade}`)!,
  boot: CAT.parts.find((p) => p.name === "Grooved blade boot" && p.parent === `blade:${blade}`)!,
});
const hub = (blade: number) =>
  new THREE.Matrix4().makeTranslation(...PROP).multiply(new THREE.Matrix4().makeRotationX((blade * Math.PI * 2) / 3));
// The blade group's display pitch, from the same helper Airplane.tsx and the feed-tube anim use.
const pitch = (s: Sim) => new THREE.Matrix4().makeRotationY(bladeDisplayPitch(s));
const atLever = (lever: number, govFail = false): Sim => ({
  ...initialSim,
  eng: { ...initialSim.eng, lever, govFail },
});
/** Lever 0 → 1 in twentieths, plus governor failure at full lever. */
const sweepStates = () => [...Array.from({ length: 21 }, (_, i) => atLever(i / 20)), atLever(1, true)];

it("hub-mounted feed tubes keep their world pose through the display-pitch sweep (AMM 61-10 p. 4 item (e))", () => {
  const saved = useSR22T.getState().s;
  const states = sweepStates();
  // The sweep really pitches the blades, so a pose that holds is the anim cancelling it, not a constant pitch.
  const pitches = states.map(bladeDisplayPitch);
  expect(Math.max(...pitches) - Math.min(...pitches)).toBeGreaterThan(0.1);
  try {
    for (const blade of [0, 1, 2]) {
      const { tube } = pair(blade);
      const mesh = new THREE.Mesh(tube.geo());
      try {
        const local = points(mesh.geometry, new THREE.Matrix4());
        const expected = local.map((p) => p.clone().applyMatrix4(hub(blade)));
        for (const s of states) {
          useSR22T.setState({ s });
          tube.anim!(mesh, 0);
          mesh.updateMatrix();
          const m = hub(blade).multiply(pitch(s)).multiply(mesh.matrix);
          local.forEach((p, i) => expect(p.clone().applyMatrix4(m).distanceTo(expected[i])).toBeLessThan(1e-9));
        }
      } finally {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  } finally {
    useSR22T.setState({ s: saved });
  }
});

it("feed tips face the second groove with the AMM full-fine 2.5–5.1 mm surface gap (30-60 p. 2)", () => {
  const saved = useSR22T.getState().s;
  try {
    const s = atLever(0);
    useSR22T.setState({ s });
    for (const blade of [0, 1, 2]) {
      const { tube, boot } = pair(blade);
      const bg = boot.geo(),
        mesh = new THREE.Mesh(tube.geo());
      try {
        const ys = [
          ...new Set(
            points(bg, new THREE.Matrix4())
              .filter((p) => Math.abs(p.x + 0.011) < 1e-6)
              .map((p) => p.y),
          ),
        ].sort((a, b) => a - b);
        expect(ys.length).toBe(4);
        const second = (ys[2] + ys[3]) / 2 + boot.pos![1];
        tube.anim!(mesh, 0);
        mesh.updateMatrix();
        const tw = hub(blade).multiply(pitch(s)).multiply(mesh.matrix);
        const bw = hub(blade)
          .multiply(pitch(s))
          .multiply(new THREE.Matrix4().makeTranslation(...boot.pos!));
        const tip = (mesh.geometry as THREE.TubeGeometry).parameters.path.getPoint(1).applyMatrix4(tw);
        const bladeTip = tip.clone().applyMatrix4(hub(blade).multiply(pitch(s)).invert());
        expect(bladeTip.y).toBeCloseTo(second, 6);
        const tree = new MeshBVH(bg);
        const tg = mesh.geometry as THREE.TubeGeometry;
        const rim = points(tg, tw).slice(-(tg.parameters.radialSegments + 1));
        const inverse = bw.clone().invert();
        const gap = Math.min(...rim.map((p) => tree.closestPointToPoint(p.applyMatrix4(inverse))!.distance));
        expect(gap).toBeGreaterThanOrEqual(0.0025);
        expect(gap).toBeLessThanOrEqual(0.0051);
      } finally {
        bg.dispose();
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  } finally {
    useSR22T.setState({ s: saved });
  }
});

it("pitch sweep through MAX power and governor failure keeps every feed tube clear and over its boot root (AMM 30-60 pp. 2–3)", () => {
  const saved = useSR22T.getState().s;
  const states = sweepStates();
  let minGap = Infinity,
    maxTipGap = 0;
  try {
    for (const blade of [0, 1, 2]) {
      const { tube, boot } = pair(blade);
      const bg = boot.geo(),
        mesh = new THREE.Mesh(tube.geo());
      try {
        bg.computeBoundingBox();
        const tree = new MeshBVH(bg),
          faces = tris(bg, new THREE.Matrix4());
        const tg = mesh.geometry as THREE.TubeGeometry;
        for (const s of states) {
          useSR22T.setState({ s });
          tube.anim!(mesh, 0);
          mesh.updateMatrix();
          const tw = hub(blade).multiply(pitch(s)).multiply(mesh.matrix);
          const bw = hub(blade)
            .multiply(pitch(s))
            .multiply(new THREE.Matrix4().makeTranslation(...boot.pos!));
          const relative = bw.clone().invert().multiply(tw);
          const context = `blade ${blade}, lever ${s.eng.lever}, govFail ${s.eng.govFail}`;
          expect(Boolean(tree.intersectsGeometry(tg, relative)), context).toBe(false);
          for (const p of points(tg, relative)) expect(inside(p, faces, bg.boundingBox!), context).toBe(false);
          const gap = tree.closestPointToGeometry(tg, relative)!.distance;
          expect(gap, context).toBeGreaterThan(0);
          minGap = Math.min(minGap, gap);
          // The actual terminal ring remains close to the boot throughout travel, rather than clearing it by missing it.
          const rim = points(tg, relative).slice(-(tg.parameters.radialSegments + 1));
          const tipGap = Math.min(...rim.map((p) => tree.closestPointToPoint(p)!.distance));
          expect(tipGap, context).toBeLessThanOrEqual(0.0051);
          maxTipGap = Math.max(maxTipGap, tipGap);
          if (s.eng.lever === 0 || s.eng.govFail) expect(tipGap, context).toBeGreaterThanOrEqual(0.0025);
          // A discharge ray from the centre of the tube tip still lands on the grooved root, at its radial station.
          const tip = tg.parameters.path.getPoint(1).applyMatrix4(relative);
          const direction = new THREE.Vector3(1, 0, 0).transformDirection(bw.clone().invert().multiply(hub(blade)));
          const hit = tree.raycastFirst(new THREE.Ray(tip, direction), THREE.DoubleSide);
          expect(hit, context).not.toBeNull();
          expect(hit!.distance, context).toBeLessThanOrEqual(0.004 + 0.0051 + 0.002);
          expect(hit!.point.y + boot.pos![1], context).toBeCloseTo(tip.y + boot.pos![1], 6);
          expect(hit!.point.y, context).toBeLessThan(0);
        }
      } finally {
        bg.dispose();
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  } finally {
    useSR22T.setState({ s: saved });
  }
  console.info(
    `Pitch sweep: minimum tube/boot clearance ${(minGap * 1000).toFixed(3)} mm; maximum tip gap ${(maxTipGap * 1000).toFixed(3)} mm`,
  );
});
