import * as THREE from "three";

export type Tri = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

export const points = (g: THREE.BufferGeometry, m: THREE.Matrix4) => {
  const p = g.attributes.position;
  return Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m));
};
export const tris = (g: THREE.BufferGeometry, m: THREE.Matrix4): Tri[] => {
  const v = points(g, m),
    ix = g.index;
  const mesh: Tri[] = Array.from({ length: (ix?.count ?? v.length) / 3 }, (_, i) => [
    v[ix ? ix.getX(3 * i) : 3 * i],
    v[ix ? ix.getX(3 * i + 1) : 3 * i + 1],
    v[ix ? ix.getX(3 * i + 2) : 3 * i + 2],
  ]);
  placements.set(mesh, { geometry: g, inverse: m.clone().invert() });
  return mesh;
};
/** Ray-crossing count against a closed mesh (Möller–Trumbore); an odd count means inside. */
const DIR = new THREE.Vector3(0.31, 0.83, 0.47).normalize();
// Synchronous exact checks reuse scratch vectors; input meshes and geometries are immutable snapshots.
const E1 = new THREE.Vector3(),
  E2 = new THREE.Vector3(),
  H = new THREE.Vector3(),
  S = new THREE.Vector3(),
  Q = new THREE.Vector3();
const QUERY_RAY = new THREE.Ray();
export const inside = (p: THREE.Vector3, mesh: Tri[], box: THREE.Box3) => {
  if (!box.containsPoint(p)) return false;
  let n = 0;
  const { tree, inverse } = prepared(mesh);
  QUERY_RAY.origin.copy(p).applyMatrix4(inverse);
  QUERY_RAY.direction.copy(DIR).transformDirection(inverse);
  for (const face of candidates(tree, (b) => QUERY_RAY.intersectsBox(b))) {
    const [a, b, c] = mesh[face.index];
    const e1 = E1,
      e2 = E2,
      h = H,
      s = S,
      q = Q;
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    h.crossVectors(DIR, e2);
    const det = e1.dot(h);
    if (Math.abs(det) < 1e-12) continue;
    s.subVectors(p, a);
    const u = s.dot(h) / det;
    if (u < 0 || u > 1) continue;
    q.crossVectors(s, e1);
    const v = DIR.dot(q) / det;
    if (v < 0 || u + v > 1) continue;
    if (e2.dot(q) / det > 1e-9) n++;
  }
  return n % 2 === 1;
};
/** Ray/segment tolerance also expands broad-phase bounds; pruning cannot discard a boundary hit. */
const MARGIN = 1e-9;
type Face = { index: number; box: THREE.Box3 };
type Node = { box: THREE.Box3; faces?: Face[]; children?: [Node, Node] };
const treeOf = (faces: Face[]): Node => {
  const box = new THREE.Box3();
  for (const face of faces) box.union(face.box);
  if (faces.length <= 8) return { box, faces };
  const size = box.getSize(new THREE.Vector3());
  const axis: "x" | "y" | "z" = size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
  const ordered = [...faces].sort((a, b) => a.box.min[axis] + a.box.max[axis] - (b.box.min[axis] + b.box.max[axis]));
  const middle = Math.floor(ordered.length / 2);
  return { box, children: [treeOf(ordered.slice(0, middle)), treeOf(ordered.slice(middle))] };
};
/** Conservative expanded-AABB traversal; only candidates reach the unchanged exact checks. */
const candidates = (root: Node, intersects: (box: THREE.Box3) => boolean) => {
  const stack = [root],
    faces: Face[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    if (!intersects(node.box)) continue;
    if (node.children) stack.push(...node.children);
    else for (const face of node.faces!) if (intersects(face.box)) faces.push(face);
  }
  return faces;
};
const placements = new WeakMap<Tri[], { geometry: THREE.BufferGeometry; inverse: THREE.Matrix4 }>();
const geometryTrees = new WeakMap<THREE.BufferGeometry, Node>();
const cache = new WeakMap<Tri[], { tree: Node; inverse: THREE.Matrix4; worldBox: THREE.Box3; margin: number }>();
const prepared = (mesh: Tri[]) => {
  let p = cache.get(mesh);
  if (!p) {
    const placement = placements.get(mesh);
    let tree = placement && geometryTrees.get(placement.geometry);
    if (!tree) {
      const local = placement ? tris(placement.geometry, new THREE.Matrix4()) : mesh;
      tree = treeOf(
        local.map((t, index) => ({ index, box: new THREE.Box3().setFromPoints(t).expandByScalar(MARGIN) })),
      );
      if (placement) geometryTrees.set(placement.geometry, tree);
    }
    p = {
      tree,
      inverse: placement?.inverse ?? new THREE.Matrix4(),
      margin: localMargin(placement?.inverse ?? new THREE.Matrix4()),
      worldBox: new THREE.Box3().setFromPoints(mesh.flat()).expandByScalar(MARGIN),
    };
    cache.set(mesh, p);
  }
  return p;
};
// Frobenius norm conservatively bounds the inverse transform's expansion of the world-space tolerance.
const localMargin = (m: THREE.Matrix4) => {
  const e = m.elements;
  return MARGIN * Math.hypot(e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]);
};
/** Non-coplanar edge/face crossings. Mesh coordinates must remain immutable while cached. */
export const edgeCrossing = (left: Tri[], right: Tri[]) => {
  const source = prepared(left),
    target = prepared(right);
  if (!source.worldBox.intersectsBox(target.worldBox)) return undefined;
  const targetInSource = target.worldBox.clone().applyMatrix4(source.inverse).expandByScalar(source.margin);
  const ray = new THREE.Ray(),
    direction = new THREE.Vector3(),
    hit = new THREE.Vector3(),
    edgeBox = new THREE.Box3(),
    localA = new THREE.Vector3(),
    localB = new THREE.Vector3();
  for (const face of candidates(source.tree, (b) => b.intersectsBox(targetInSource)))
    for (let i = 0; i < 3; i++) {
      const t = left[face.index],
        a = t[i],
        b = t[(i + 1) % 3],
        length = direction.subVectors(b, a).length();
      if (length < 1e-12) continue;
      ray.set(a, direction.multiplyScalar(1 / length));
      localA.copy(a).applyMatrix4(target.inverse);
      localB.copy(b).applyMatrix4(target.inverse);
      edgeBox.setFromPoints([localA, localB]).expandByScalar(target.margin);
      for (const f of candidates(target.tree, (box) => box.intersectsBox(edgeBox))) {
        if (ray.intersectTriangle(...right[f.index], false, hit) && a.distanceTo(hit) <= length + MARGIN)
          return hit.clone();
      }
    }
  return undefined;
};
