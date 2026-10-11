/** Handles to live three.js objects so UI code can locate parts in the scene. */
import * as THREE from "three";
import { flashFocus, revealStage, useView } from "./view";

/**
 * Meshes of the mounted airplane, by part name: the first pinned mesh of each name (the one that carries the label, as
 * `Catalogue.pinned` picks it), else the first mounted one. Part meshes join with `registerPart`.
 */
export const partObjects = new Map<string, THREE.Mesh>();
const mounted = new Map<string, { mesh: THREE.Mesh; pinned: boolean }[]>();

/** Add a mounted part mesh to `partObjects`; the returned function removes it again (on unmount). */
export function registerPart(name: string, mesh: THREE.Mesh, pinned: boolean) {
  const pick = () => {
    const l = mounted.get(name) ?? [];
    const m = (l.find((e) => e.pinned) ?? l[0])?.mesh;
    if (m) partObjects.set(name, m);
    else {
      partObjects.delete(name);
      mounted.delete(name);
    }
  };
  mounted.set(name, [...(mounted.get(name) ?? []), { mesh, pinned }]);
  pick();
  // "tap to locate" asked for this part before it was mounted (a progressive build still adding it): go there now
  if (waiting === name) {
    waiting = null;
    focusPart(name);
  }
  return () => {
    const rest = (mounted.get(name) ?? []).filter((e) => e.mesh !== mesh);
    mounted.set(name, rest);
    pick();
  };
}
export const view: { camera: THREE.Camera | null; target: THREE.Vector3 | null } = { camera: null, target: null };

/** A part "tap to locate" asked for that is not mounted yet: focused as soon as it is. */
let waiting: string | null = null;

/** Fly the camera to a named part (keeping the current viewing direction) and flash it; a part not mounted yet, once it is. */
export function focusPart(name: string) {
  // phones: the list is far below the 3D view
  revealStage();
  flashFocus(name);
  const o = partObjects.get(name);
  waiting = o ? null : name;
  if (!o) return;
  const g = o.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  // a part mounted this moment has no world matrix from a render yet
  o.updateWorldMatrix(true, false);
  const c = o.localToWorld(g.boundingSphere!.center.clone());
  const dir =
    view.camera && view.target
      ? view.camera.position.clone().sub(view.target).normalize()
      : new THREE.Vector3(1, 0.6, 1).normalize();
  const p = c.clone().add(dir.multiplyScalar(2.6));
  useView.getState().flyTo([p.x, p.y, p.z], [c.x, c.y, c.z]);
}
