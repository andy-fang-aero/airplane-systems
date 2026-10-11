/**
 * Airframe geometry for the SR22T G6 model.
 *
 * Axes: x forward, y up, z toward the right wing. Units: metres.
 * Fuselage profile from POH 13772-007 Figure 1-1 (three view, p. 1-4), which draws the same outline and
 * dimensions as the SR20 POH 11934-005 Figure 1-1 it was traced from; tailcone, fin and window outlines
 * traced from an SR20 G6 side photo (OO-CBB, s/n 2347, Wikimedia Commons).
 */
import * as THREE from "three";
import { CRANK_Y } from "./engine-datum";
import { densify, finSurface, fuselage, interp, liftingSurface, roundPoly, type Ring } from "@/lib/geometry";
import { clamp, lerp } from "@/lib/math";
import { openExhaustExits } from "./exhaust-layout";

export { box, cyl, sph, tubeGeo, loft, af } from "@/lib/geometry";

/**
 * Teardrop wheel fairing: blunt nose, pointed tail, widest at the axle. A lathe, unlike the shared lofted pantGeo:
 * the SR22T main pant (parts/gear.ts) is built from this lathe profile.
 */
export function pantGeo(len: number, r: number) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const h = (i / 24) * len,
      u = 1 - h / len;
    pts.push(new THREE.Vector2(r * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 0.8) + 1e-4, h));
  }
  const g = new THREE.LatheGeometry(pts, 28);
  g.rotateZ(-Math.PI / 2);
  g.translate(-len * 0.72, 0, 0);
  return g;
}

/* ---------- fuselage ---------- */

/** Firewall (FS 100) and aft baggage bulkhead (FS 222) stations. */
export const FW = 2.61,
  AB = -0.49;
export const GROUND_Y = -1.39;

// x, halfWidth, halfHeight, centerY — cowl & cabin from POH Fig. 1-1; tailcone from FS 212 aft scaled from AMM 13773-002
// Fig 6-00-2 plan and side views (the last two rows from the G6 side photo)
const FUS = [
  [3.74, 0.32, 0.155, -0.125],
  [3.66, 0.42, 0.24, -0.16],
  [3.52, 0.5, 0.3, -0.19],
  [3.3, 0.55, 0.35, -0.2],
  [2.96, 0.6, 0.4, -0.22],
  [2.61, 0.62, 0.45, -0.23],
  [2.31, 0.625, 0.575, -0.13],
  [2.01, 0.635, 0.654, -0.06],
  [1.71, 0.64, 0.7, -0.02],
  [1.26, 0.65, 0.718, 0.0],
  [0.65, 0.645, 0.69, -0.006],
  [0.05, 0.61, 0.623, -0.015],
  [-0.25, 0.488, 0.56, -0.03],
  [-0.55, 0.414, 0.524, -0.025],
  [-0.85, 0.335, 0.472, -0.033],
  [-1.15, 0.262, 0.432, -0.028],
  [-1.6, 0.17, 0.387, -0.007],
  [-2.05, 0.114, 0.364, 0.026],
  [-2.4, 0.089, 0.33, 0.025],
  [-2.8, 0.084, 0.27, -0.02],
  [-3.1, 0.08, 0.2, -0.072],
  [-3.3, 0.04, 0.09, -0.11],
  [-3.36, 0.015, 0.03, -0.11],
];
/** Existing approximate spinner dimensions; POH 13772-007 Fig 1-1 p. 1-4; AMM 61-10 p. 1 (PDF 2438). */
export const SPINNER_BASE_X = 3.74,
  SPINNER_BASE_RADIUS = 0.155;
/** Approximate 20-mm lip blend, ending ahead of the cooling rims (their frontmost x is 3.718). */
export const COWL_NOSE_BLEND_X = SPINNER_BASE_X - 0.02;
/**
 * Cowl cross-section forward of the firewall. The cabin's tumblehome (CABIN_TUMBLE, CABIN_N_TOP: the SR20 cabin
 * fit) stops at FS 100. The upper cowl (AMM 13773-002 Rev 7 Fig 71-10-2 item 1, PDF p. 2510) is a broad arch with full
 * shoulders. It encloses the intercoolers on the side baffles (AMM Fig 71-00-2 sheets 1–2, PDF pp. 2487–2488; Fig 71-60-2
 * sheet 2, PDF p. 2558), whose outer edges are dimensioned at 21.15 / 21.23 in from the crank CL (Continental M-18
 * Fig 5-34 p. 5-54). Half-widths, heights and centres stay the POH 13772-007 Fig 1-1 (p. 1-4) station table above.
 * Approximate: no source dimensions the cowl's cross-section. COWL_SECTION is fitted, station by station along the
 * cores (FS ≈ 94 aft face to FS ≈ 82 front face, intercooler-layout.ts), so the skin at the core-top height
 * (crank + 5.0 in, M-18 Fig 5-35) passes 10–15 mm outboard of the LH core's 21.23 in edge and 11–17 mm outboard of the
 * RH core's 21.15 in edge; the rendered skin stays at least 8 mm off the cores. The shoulder fills only as far as the
 * cores need. From the firewall it blends out of the cabin fit; ahead of the cores it holds the front fit. The
 * side-baffle deck-edge seal is placed against this skin (AMM 71-00 §1.B, PDF p. 2470: seals in contact with the cowling).
 */
// Cabin fit from POH 13772-007 Fig 1-1 p. 1-4 (unchanged; approximate, the figure gives no section shape).
const CABIN_N_TOP = 2.4, // approximate: POH Fig 1-1 p. 1-4 cabin fit, unchanged by the cowl section
  CABIN_TUMBLE = 0.2; // approximate: POH Fig 1-1 p. 1-4 cabin fit, unchanged by the cowl section
// [x, nTop, tumble], descending x (Catmull-Rom, clamped). Approximate: fitted to the M-18 Fig 5-34 p. 5-54 cores.
export const COWL_SECTION = [
  [3.08, 2.8, 0], // approximate: RH core front face (M-18 Fig 5-34 p. 5-54), held to the nose blend
  [3.06, 2.75, 0], // approximate: LH core front face, ≈ 10 mm outside the 21.23 in edge (M-18 Fig 5-34 p. 5-54)
  [2.95, 2.5, 0], // approximate: core middle, ≥ 8 mm rendered off the cores (M-18 Fig 5-34 p. 5-54)
  [2.85, 2.4, 0.01], // approximate: core middle-aft, ≈ 10 mm (M-18 Fig 5-34 p. 5-54)
  [2.765, 2.4, 0.02], // approximate: cores' aft face, ≈ 11 mm (M-18 Fig 5-34 p. 5-54)
  [FW, CABIN_N_TOP, CABIN_TUMBLE], // the cabin fit at the firewall and aft (the table clamps), unchanged
];
// POH Fig 1-1 p. 1-4 and AMM 61-10 p. 1: the nose lip meets the coaxial spinner bulkhead.
// Blend its circular section into the traced cowl without changing any aft station or inlet/attach anchor.
// Radius and blend length are illustrative, not published dimensions.
export const FUSE = fuselage({
  table: FUS,
  nTop: CABIN_N_TOP,
  nBot: 3.0,
  tumble: CABIN_TUMBLE,
  section: (x) => ({ nTop: interp(COWL_SECTION, 1, x), nBot: 3.0, tumble: Math.max(0, interp(COWL_SECTION, 2, x)) }),
  profile: (x, base) => {
    if (x <= COWL_NOSE_BLEND_X) return base;
    const u = clamp((x - COWL_NOSE_BLEND_X) / (SPINNER_BASE_X - COWL_NOSE_BLEND_X), 0, 1);
    const t = u * u * (3 - 2 * u);
    return {
      hw: lerp(base.hw, SPINNER_BASE_RADIUS, t),
      hh: lerp(base.hh, SPINNER_BASE_RADIUS, t),
      cy: lerp(base.cy, CRANK_Y, t),
      nTop: lerp(base.nTop, 2, t),
      nBot: lerp(base.nBot, 2, t),
      tumble: lerp(base.tumble, 0, t),
    };
  },
});
export const { fus, topY, botY, onSkin, lowerSkinY } = FUSE;
export const fRing = FUSE.ring;
export const inFus = FUSE.inside;
export const planeRing = FUSE.plate;
export const sectionSlab = FUSE.slab;

/*
 * ---------- wing: root buried at z 0.35. Planform scaled from AMM 13773-002 Fig 6-00-2 (SR22/SR22T; the SR20 POH Fig 1-1
 * plan view matches within 1 %): LE FS 131.5 at BL 40 to 137.9 at BL 220, chord 56.5 in to 30.3 in, LEMAC FS 133.1 at
 * BL 87.7 (SR20 POH Section 6). Dihedral 5.5° (AMM 6-00). ----------
 */
export const WR = 0.35,
  WTIP = 5.84,
  WSPAN = WTIP - WR;
/** Tip rounding: the LE stays straight to BL ≈ 218.5 and rounds over the last ~8 in, square TE corner (AMM Fig 6-00-2). */
const tipCut = (z: number) => {
  const a = Math.abs(z);
  return a > 5.55 ? 0.45 * Math.pow((a - 5.55) / 0.29, 2) : 0;
};
export const wLE = (z: number) => 1.84 - (Math.abs(z) - WR) * 0.036 - tipCut(z);
export const wC = (z: number) => 1.53 - ((Math.abs(z) - WR) / WSPAN) * 0.8 - tipCut(z);
export const wY = (z: number) => -0.6 + (Math.abs(z) - WR) * 0.0963;
export const wT = (z: number) => 0.15 - ((Math.abs(z) - WR) / WSPAN) * 0.04;
const WING = liftingSurface({ le: wLE, chord: wC, y: wY, t: wT, m: 0.02 });

/** Point on the wing at span z and chord fraction xc; up = +1 upper, -1 lower, 0 mean line. */
export const wingP = WING.p;
export const wingSec = WING.sec;

/*
 * ---------- horizontal tail: planform scaled from AMM 13773-002 Fig 6-00-2 (SR22/SR22T; the SR20 POH Fig 1-1 plan view
 * shows the same shape): LE FS 294.5 at BL 10 to 301.3 at BL 70, TE FS 324.3 to 321.3, tip at BL 77.3 ----------
 */
export const SY = -0.02,
  /** Stabilizer half-span: RBL 77.3 per AMM Fig 6-00-2; AMM 6-00 text says 13.17 ft (4.01 m). */
  SSPAN = 1.963,
  /** Elevator chord fraction: a straight, unswept hinge line at FS 315.2 (AMM Fig 6-00-2). */
  EF = 0.694;
/** Elevator tip (horn balance): outboard of HZ (BL 72) the elevator is full chord with a rounded leading corner (AMM Fig 55-20-2). */
export const HZ = 1.83;
/** How far the rounded elevator tip cuts back the leading edge outboard of HZ (the trailing edge stays straight). */
const hTip = (z: number) => {
  const a = Math.abs(z);
  return a > HZ ? 0.45 * (1 - Math.sqrt(Math.max(0, 1 - ((a - HZ) / (SSPAN - HZ)) ** 2))) : 0;
};
export const sLE = (z: number) => -2.302 - Math.abs(z) * 0.113 - hTip(z);
export const sC = (z: number) => 0.798 - Math.abs(z) * 0.163 - hTip(z);
/** Rudder horn (balance): above HH (WL 160.2) the rudder is a full-chord cap (AMM Fig 6-00-2, Fig 55-40-1 Detail B). */
export const HH = 1.4;
export const stabSec = liftingSurface({ le: sLE, chord: sC, y: () => SY, t: () => 0.1, m: 0 }).sec;

/* ---------- fin: dorsal fillet from x -1.95, swept LE, flat top ---------- */
// [height, leading edge x, trailing edge x]: leading edge traced from the G6 side photo; trailing edge and top scaled from
// AMM 13773-002 Fig 6-00-2 (SR22/SR22T): top WL 165.5, aft-most point FS 350.2 (SR20 POH Fig 1-1: length 26.0 ft)
// The dorsal-fillet rows (h 0.39–0.51) start on the tailcone skin, whose top follows AMM Fig 6-00-2. The h 0.58 row lies on the
// traced LE and TE lines between h 0.52 and 0.8, spaced up so the raised fillet blends into the fin LE without a crease.
export const FIN = [
  [-0.25, -2.95, -3.2],
  [-0.1, -2.7, -3.4],
  [0.05, -2.45, -3.455],
  [0.2, -2.15, -3.48],
  [0.39, -1.95, -3.5],
  [0.43, -2.14, -3.505],
  [0.47, -2.29, -3.515],
  [0.51, -2.42, -3.525],
  [0.58, -2.59, -3.546],
  [0.8, -2.7, -3.585],
  [1.1, -2.88, -3.64],
  [1.32, -3.0, -3.68],
  [1.42, -3.15, -3.7],
  [1.47, -3.29, -3.715],
  [1.51, -3.45, -3.73],
  [1.534, -3.62, -3.745],
];
const finAt = (h: number) => {
  let i = 0;
  while (i < FIN.length - 2 && h > FIN[i + 1][0]) i++;
  const [h0, a0, b0] = FIN[i],
    [h1, a1, b1] = FIN[i + 1],
    t = clamp((h - h0) / (h1 - h0), 0, 1);
  return [lerp(a0, a1, t), lerp(b0, b1, t)];
};
export const fLE = (h: number) => finAt(h)[0];
export const fC = (h: number) => finAt(h)[0] - finAt(h)[1];
// rudder hinge line (height, x): the rudder/fin split line, FS 320.7 at WL 98 to FS 339.3 at WL 155 (AMM Fig 6-00-2)
const RH = [
  [-0.18, -3.0],
  [1.44, -3.52],
];
export const hingeX = (h: number) => lerp(RH[0][1], RH[1][1], (h - RH[0][0]) / (RH[1][0] - RH[0][0]));
/** Chord fraction of the rudder hinge below the horn. */
export const finCut = (h: number) => (h < RH[0][0] || h > RH[1][0] ? 1 : clamp((fLE(h) - hingeX(h)) / fC(h), 0.05, 1));
export const finSec = finSurface({ le: fLE, chord: fC, t: (h) => Math.min(0.11, 0.1 / fC(h)) }).sec;
/** Fin section heights: the fin ends at the horn joint. */
export const finHs = [...FIN.map((r) => r[0]).filter((h) => h < HH), HH];

/* ---------- windows & painted skin ---------- */
export const SK = { x0: -3.45, x1: 4.2, y0: -0.95, y1: 1.0, W: 2048, H: 512 };

export const WIN = {
  /** Gull-wing door window: slanted front edge parallel to the A-pillar, raked rear edge (AMM Fig 52-10-8, PDF 2046); refitted to POH Fig 1-2 opening. */
  front: roundPoly(
    [
      [1.64, 0.12],
      [1.43, 0.575],
      [0.93, 0.59],
      [1.07, 0.11],
    ],
    0.16,
  ),
  /** Fixed rear window: straight front edge, top follows the roof, large rounded aft edge. */
  rear: roundPoly(
    [
      [0.79, 0.11],
      [0.78, 0.4],
      [0.72, 0.5],
      [0.62, 0.535],
      [0.4, 0.505],
      [0.18, 0.44],
      [0.06, 0.38],
      [0.015, 0.3],
      [0.04, 0.22],
      [0.12, 0.16],
      [0.3, 0.125],
      [0.6, 0.1],
    ],
    0.3,
    2,
  ),
  /** Wrap-around windshield: lower side edge then A-pillar up to the roof. */
  windLower: [
    [2.45, 0.24],
    [1.93, 0.12],
    [1.73, 0.6],
  ],
};

/** Surface coordinates (x, q): q is normalized arc length from belly (-1) to roof (+1).
 * This avoids the side-projection singularity at the roof wrap. */
const arcCache = new Map<number, { points: THREE.Vector3[]; lengths: number[]; total: number }>();
function skinArc(x: number) {
  // Keep the short, steep lip blend smooth; cabin cuts retain their existing 1-mm lookup stations.
  const resolution = x > COWL_NOSE_BLEND_X ? 10000 : 1000;
  x = Math.round(x * resolution) / resolution;
  let arc = arcCache.get(x);
  if (!arc) {
    const points = fRing(x, 1, 240, -Math.PI / 2, Math.PI / 2, false);
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
    arc = { points, lengths, total: lengths.at(-1)! };
    if (arcCache.size >= 256) arcCache.delete(arcCache.keys().next().value!);
    arcCache.set(x, arc);
  }
  return arc;
}
export function doorSkin(x: number, q: number, side: number) {
  const { points, lengths, total } = skinArc(x),
    target = ((q + 1) * total) / 2;
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < target) i++;
  const p = points[i - 1]
    .clone()
    .lerp(points[i], clamp((target - lengths[i - 1]) / (lengths[i] - lengths[i - 1]), 0, 1));
  p.x = x;
  p.z *= side;
  return p;
}
export function doorParam(p: THREE.Vector3): THREE.Vector2 {
  const { points, lengths, total } = skinArc(p.x);
  let low = 0,
    high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle].y < p.y) low = middle;
    else high = middle;
  }
  const t = clamp((p.y - points[low].y) / (points[high].y - points[low].y), 0, 1);
  return new THREE.Vector2(p.x, (2 * lerp(lengths[low], lengths[high], t)) / total - 1);
}
/** Lower-cowl submerged induction inlets (POH 13772-007 7-37; AMM 13773-002 Rev 7
 * 71-60, PDF p. 2542). Position and 140 x 50 mm footprint are retained display
 * approximations; these references do not dimension the inlet. The 12 mm ramp depth
 * and curved widening are approximate illustrations of a submerged NACA inlet.
 * Every lip point is projected onto the existing POH Fig 1-1 (1-4)-derived loft, with
 * the loft's own lower-skin exponent (FUSE nBot), so the lips follow any loft change. */
function inductionSkin(x: number, z: number) {
  return new THREE.Vector3(x, lowerSkinY(x, z), z);
}
export const inductionAnchor = (side: number) => inductionSkin(3.3, side * 0.36);
function inductionEdges(side: number) {
  return Array.from({ length: 15 }, (_, i) => {
    const t = i / 14,
      x = 3.44 - 0.14 * t;
    const width = 0.004 + 0.021 * t * t * (3 - 2 * t);
    return [-1, 1].map((edge) => inductionSkin(x, side * (0.36 + edge * width)));
  });
}
const inductionOpening = (side: number) => {
  const edges = inductionEdges(side);
  return [...edges.map((row) => row[0]), ...edges.map((row) => row[1]).reverse()].map(doorParam);
};
/** Ramp and recessed side walls; the aft lip stays at the skin, above the throat. */
export function inductionGeo(side: number) {
  const rows = inductionEdges(side),
    positions: number[] = [];
  const floor = rows.map((row, i) => row.map((p) => p.clone().add(new THREE.Vector3(0, (0.012 * i) / 14, 0))));
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, reverse: boolean) => {
    for (const p of reverse ? [a, d, c, a, c, b] : [a, b, c, a, c, d]) positions.push(p.x, p.y, p.z);
  };
  for (let i = 1; i < rows.length; i++) {
    // Floors face down; each wall faces inward toward the open duct. Mirroring flips winding.
    quad(floor[i - 1][0], floor[i][0], floor[i][1], floor[i - 1][1], side > 0);
    for (const edge of [0, 1])
      quad(rows[i - 1][edge], rows[i][edge], floor[i][edge], floor[i - 1][edge], side * (edge ? 1 : -1) < 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/** Parallel offset of a convex outline in surface coordinates; dimensions/overlap are display approximations. */
function offsetOutline(poly: THREE.Vector2[], distance: number) {
  const winding = THREE.ShapeUtils.isClockWise(poly) ? -1 : 1;
  return poly.map((p, i) => {
    const a = p
      .clone()
      .sub(poly[(i + poly.length - 1) % poly.length])
      .normalize();
    const b = poly[(i + 1) % poly.length].clone().sub(p).normalize();
    const na = new THREE.Vector2(a.y, -a.x).multiplyScalar(winding);
    const nb = new THREE.Vector2(b.y, -b.x).multiplyScalar(winding);
    const bisector = na.clone().add(nb);
    return p.clone().addScaledVector(bisector, distance / bisector.dot(na));
  });
}
/** POH 13772-007 Fig 1-2, 1-5 (PDF 15): 32.0-in top and 33.4-in roof-to-sill height.
 * Upper corners wrap to z=0.12, approximately 20.0 in inboard of the lower skin.
 * Side-view straight-edge rake scaled from an 800-dpi render: forward ~0.41, aft ~0.29
 * (horizontal/vertical). Top 32.0 in and vertical height 33.3 in are dimensioned;
 * sill ~35.5 in is derived from the dimensioned top plus the scaled forward/aft
 * edge offsets, not an independent published dimension. Rake remains a drawing estimate.
 * POH wins where the sources disagree. Placement approximate. */
const openingCorners = [
  onSkin(2.008, -0.146, 1, 1),
  onSkin(1.673, 0.67, 1, 1),
  onSkin(0.86, 0.694, 1, 1),
  onSkin(1.105, -0.146, 1, 1),
];
// Fit the top to the roof wrap without exceeding the existing airframe loft.
for (const p of openingCorners.slice(1, 3)) {
  let low = 0.5,
    high = topY(p.x);
  for (let i = 0; i < 40; i++) {
    const y = (low + high) / 2;
    if (onSkin(p.x, y, 1, 1).z > 0.12) low = y;
    else high = y;
  }
  p.copy(onSkin(p.x, (low + high) / 2, 1, 1));
}
const openingParam = openingCorners.map(doorParam);
const cabinCorners = offsetOutline(openingParam, 0.014);
// Soft corners and curved forward perimeter, scaled from AMM Fig 52-10-8 (PDF 2046).
const cabinCut = roundPoly(
  cabinCorners.map((p) => [p.x, p.y]),
  0.02,
  1,
).map(([x, q]) => new THREE.Vector2(x, q));
/** Door opening on each side, separate from the exterior cut edge/jamb overlap. */
export const DOOR_OPENING = (side: number) => openingParam.map((p) => doorSkin(p.x, p.y, side));
export const DOOR_CUT = (side: number) => cabinCut.map((p) => doorSkin(p.x, p.y, side));
/** Side projection retained for released CAPS consumers. Jamb overlap ~14 mm, approximate. */
export const DOOR_SEAM = DOOR_CUT(1).map((p) => [p.x, p.y]);
/** AMM Fig 52-30-1 sheet 1, PDF 2055 (applies to the modelled airplane): left door, forward piano hinge, lanyard.
 * POH Fig 1-2: 21.0 x 20.0 in, 10.5-in top flat and 5.0-in chamfer drop; placement/radii approximate. */
export const BAG_CORNERS = [
  [-0.1, -0.228],
  [-0.1, 0.153],
  [-0.3667, 0.28],
  [-0.6334, 0.28],
  [-0.6334, -0.228],
];
const bagXY = roundPoly(BAG_CORNERS, 0.12);
const bagCut = bagXY.map(([x, y]) => doorParam(onSkin(x, y, -1, 1)));
export const BAG_DOOR = bagCut.map((p) => doorSkin(p.x, p.y, -1));
export type DoorKey = "L" | "R" | "bag";
/** Forward-corner mounting plates (AMM Fig 52-10-1 sheet 3, PDF 2013). */
export const DOOR_HINGE_MOUNTS = (side: number) => ({
  upper: doorSkin(cabinCorners[1].x, cabinCorners[1].y, side),
  lower: doorSkin(cabinCorners[0].x, cabinCorners[0].y, side),
});
/** Hinge pin offsets from each forward-corner mount (x forward, y up, z outboard), right side; z mirrors on the left.
 * AMM Fig 52-10-1 sheet 3 Details C/D (PDF 2013) draw each fuselage hinge bracket recessed in a pocket of the fuselage
 * skin ahead of the door, the door's rod end reaching forward into it, and a hinge plate cover on the door skin: the
 * pins sit inside the skin line. The figure is undimensioned: these offsets are fitted to this loft so the pins stay
 * inside the skin and the axis lies ahead of the bowed forward edge, letting the whole panel clear the hull through
 * the swing. Approximate. */
export const DOOR_HINGE_OFFSET = {
  upper: new THREE.Vector3(0.05, -0.05, 0.03),
  lower: new THREE.Vector3(0.13, 0.04, -0.04),
};
export const DOOR_HINGE = (side: number) => {
  const mounts = DOOR_HINGE_MOUNTS(side),
    offset = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.y, side * v.z);
  return {
    upper: mounts.upper.add(offset(DOOR_HINGE_OFFSET.upper)),
    lower: mounts.lower.add(offset(DOOR_HINGE_OFFSET.lower)),
  };
};
export const BAG_HINGE = { lower: onSkin(-0.1, -0.2, -1, 1), upper: onSkin(-0.1, 0.15, -1, 1) };
/** Full-open angle is not published: 70 degrees, approximate (default). */
export const DOOR_OPEN_ANGLE = (70 * Math.PI) / 180;
export function doorHinge(key: DoorKey) {
  const { upper, lower } = key === "bag" ? BAG_HINGE : DOOR_HINGE(key === "L" ? -1 : 1);
  return { pivot: lower, axis: upper.clone().sub(lower).normalize() };
}
export function doorRotation(key: DoorKey, fraction: number) {
  return new THREE.Quaternion().setFromAxisAngle(
    doorHinge(key).axis,
    (key === "R" ? 1 : -1) * DOOR_OPEN_ANGLE * fraction,
  );
}
export function doorPoint(key: DoorKey, point: THREE.Vector3, fraction: number) {
  const { pivot } = doorHinge(key);
  return point.clone().sub(pivot).applyQuaternion(doorRotation(key, fraction)).add(pivot);
}
/** 2.2-mm nominal edge clearance, inside AMM Fig 52-10-2's 1.524–3.175-mm range (PDF 2016).
 * q is arc length normalized to ~one metre in the cabin: tested against the actual 3D cut edge. */
export const DOOR_GAP = 0.0022;
export const doorEdge = (key: DoorKey) =>
  offsetOutline(key === "bag" ? bagCut : cabinCut, -DOOR_GAP).map((p) => doorSkin(p.x, p.y, key === "R" ? 1 : -1));
export const doorCutParam = (key: DoorKey) => (key === "bag" ? bagCut : cabinCut);

/** Triangulate the unwrapped skin with apertures, then refine before mapping it onto the loft.
 * Hole edges are shared with the door panels, so a coarse centroid mask cannot leave a jagged seam. */
function skinPatch(outline: THREE.Vector2[], holes: THREE.Vector2[][], side: number) {
  const shape = new THREE.Shape(outline);
  shape.holes = holes.map((p) => new THREE.Path(p));
  const flat = new THREE.ShapeGeometry(shape).toNonIndexed();
  const pos: number[] = [],
    uv: number[] = [],
    normals: number[] = [];
  const emit = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, depth = 0) => {
    const abLength = a.distanceToSquared(b),
      bcLength = b.distanceToSquared(c),
      caLength = c.distanceToSquared(a);
    // Resolve the short nose-lip blend; coarse triangles would bridge it and cut into the cowl cheeks.
    const step = Math.max(a.x, b.x, c.x) > COWL_NOSE_BLEND_X ? 0.002 : 0.04;
    if (depth < 24 && Math.max(abLength, bcLength, caLength) > step ** 2) {
      if (abLength >= bcLength && abLength >= caLength) {
        const m = a.clone().lerp(b, 0.5);
        emit(a, m, c, depth + 1);
        emit(m, b, c, depth + 1);
      } else if (bcLength >= caLength) {
        const m = b.clone().lerp(c, 0.5);
        emit(a, b, m, depth + 1);
        emit(a, m, c, depth + 1);
      } else {
        const m = c.clone().lerp(a, 0.5);
        emit(a, b, m, depth + 1);
        emit(m, b, c, depth + 1);
      }
    } else {
      const mapped = [a, b, c].map((p) => {
        const v = doorSkin(p.x, p.y, side);
        return new THREE.Vector3(Math.fround(v.x), Math.fround(v.y), Math.fround(v.z));
      });
      // Refinement at a curved cut can collapse a Float32 triangle into a zero-area sliver.
      if (mapped[1].clone().sub(mapped[0]).cross(mapped[2].clone().sub(mapped[0])).lengthSq() < 1e-20) return;
      const center = mapped.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(3);
      const cp = doorParam(center);
      const inHole = holes.some((poly) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const u = poly[i],
            v = poly[j];
          if (u.y > cp.y !== v.y > cp.y && cp.x < ((v.x - u.x) * (cp.y - u.y)) / (v.y - u.y) + u.x) inside = !inside;
        }
        return inside;
      });
      if (inHole) {
        // Curvature can put the chord's centroid just inside a cut: refine at that edge,
        // and discard only sub-millimetre slivers rather than retaining fixed skin in an aperture.
        if (depth < 24 && Math.max(abLength, bcLength, caLength) > 0.001 ** 2) {
          const ab = a.clone().lerp(b, 0.5),
            bc = b.clone().lerp(c, 0.5),
            ca = c.clone().lerp(a, 0.5);
          emit(a, ab, ca, depth + 1);
          emit(ab, b, bc, depth + 1);
          emit(ca, bc, c, depth + 1);
          emit(ab, bc, ca, depth + 1);
        }
        return;
      }
      for (const v of side > 0 ? [a, b, c] : [c, b, a]) {
        const p = doorSkin(v.x, v.y, side);
        pos.push(p.x, p.y, p.z);
        // Smooth loft normals from the implicit superellipse, independent of triangle size.
        const field = (x: number) => {
          const { hw, hh, cy, nTop, nBot, tumble } = FUSE.section(x),
            py = (p.y - cy) / hh;
          const n = py >= 0 ? nTop : nBot,
            w = hw * (1 - tumble * Math.max(0, py));
          return Math.pow(Math.abs(p.z) / w, n) + Math.pow(Math.abs(py), n);
        };
        const { hw, hh, cy, nTop, nBot, tumble } = FUSE.section(p.x),
          py = (p.y - cy) / hh;
        const n = py >= 0 ? nTop : nBot,
          w = hw * (1 - tumble * Math.max(0, py));
        const ny =
          (n * Math.sign(py) * Math.pow(Math.abs(py), n - 1)) / hh +
          (py > 0 ? (n * Math.pow(Math.abs(p.z) / w, n) * tumble) / (hh * (1 - tumble * py)) : 0);
        const nz = (n * Math.sign(p.z) * Math.pow(Math.abs(p.z) / w, n - 1)) / w;
        const normal = new THREE.Vector3((field(p.x + 0.0001) - field(p.x - 0.0001)) / 0.0002, ny, nz).normalize();
        normals.push(normal.x, normal.y, normal.z);
        uv.push((p.x - SK.x0) / (SK.x1 - SK.x0), (p.y - SK.y0) / (SK.y1 - SK.y0));
      }
    }
  };
  const a = flat.attributes.position;
  for (let i = 0; i < a.count; i += 3)
    emit(
      new THREE.Vector2(a.getX(i), a.getY(i)),
      new THREE.Vector2(a.getX(i + 1), a.getY(i + 1)),
      new THREE.Vector2(a.getX(i + 2), a.getY(i + 2)),
    );
  flat.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return g;
}
export function doorPanelGeo(key: DoorKey) {
  const outline = offsetOutline(doorCutParam(key), -DOOR_GAP);
  const side = key === "R" ? 1 : -1;
  const window = key === "bag" ? [] : [WIN.front.map(([x, y]) => doorParam(onSkin(x, y, side, 1)))];
  return skinPatch(outline, window, side);
}
export const doorWindowOutline = (side: number) => densify(WIN.front, 0.015).map(([x, y]) => onSkin(x, y, side, 1.002));
export function doorWindowGeo(side: number) {
  return skinPatch(
    WIN.front.map(([x, y]) => doorParam(onSkin(x, y, side, 1))),
    [],
    side,
  );
}

/** Window outline loops projected onto the skin (both sides + windshield). */
export function windowOutlines(): THREE.Vector3[][] {
  const loops: THREE.Vector3[][] = [];
  [1, -1].forEach((s) => [WIN.rear].forEach((w) => loops.push(densify(w).map(([x, y]) => onSkin(x, y, s)))));
  const side = (s: number) => densify(WIN.windLower, 0.03, false).map(([x, y]) => onSkin(x, y, s));
  const ta = FUSE.thetaAt(1.73, 0.6),
    tb = FUSE.thetaAt(2.45, 0.24);
  loops.push([
    ...side(1),
    ...fRing(1.73, 1.006, 40, ta, Math.PI - ta, false),
    ...side(-1).reverse(),
    ...fRing(2.45, 1.006, 40, Math.PI - tb, tb, false),
  ] as Ring);
  return loops;
}

/** Fuselage loft with side-projected UVs for the painted skin texture. */
const doorHullGeo = () => {
  const outline = [
    new THREE.Vector2(FUSE.xTail, -1),
    new THREE.Vector2(FUSE.xNose, -1),
    new THREE.Vector2(FUSE.xNose, 1),
    new THREE.Vector2(FUSE.xTail, 1),
  ];
  const right = skinPatch(outline, [cabinCut, inductionOpening(1)], 1),
    left = skinPatch(outline, [cabinCut, bagCut, inductionOpening(-1)], -1);
  // Preserve the loft's original nose/tail closures; door and induction apertures open the fixed hull.
  const caps = [FUSE.xTail, FUSE.xNose].map((x) => {
    const indexed = planeRing(x, 1),
      cap = indexed.toNonIndexed(),
      positions = cap.attributes.position;
    indexed.dispose();
    const uv = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) {
      uv[2 * i] = (positions.getX(i) - SK.x0) / (SK.x1 - SK.x0);
      uv[2 * i + 1] = (positions.getY(i) - SK.y0) / (SK.y1 - SK.y0);
      cap.attributes.normal.setXYZ(i, x === FUSE.xTail ? -1 : 1, 0, 0);
    }
    cap.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return cap;
  });
  const patches = [right, left, ...caps],
    g = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const arrays = patches.flatMap((patch) => Array.from(patch.attributes[name].array));
    g.setAttribute(name, new THREE.Float32BufferAttribute(arrays, right.attributes[name].itemSize));
  }
  for (const patch of patches) patch.dispose();
  return g;
};
export const fuselageGeo = () => openExhaustExits(doorHullGeo());

/** Paints fixed window shapes and G6 pinstripes (browser only). */
export function paintSkin(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = SK.W;
  c.height = SK.H;
  const g = c.getContext("2d")!;
  const P = ([x, y]: number[]) => [((x - SK.x0) / (SK.x1 - SK.x0)) * SK.W, (1 - (y - SK.y0) / (SK.y1 - SK.y0)) * SK.H];
  const path = (pts: number[][], close = true) => {
    g.beginPath();
    pts.forEach((q, i) => {
      const [a, b] = P(q);
      if (i) g.lineTo(a, b);
      else g.moveTo(a, b);
    });
    if (close) g.closePath();
  };
  g.fillStyle = "#F3F5F6";
  g.fillRect(0, 0, SK.W, SK.H);
  path(
    [
      [3.25, -0.37],
      [2.42, -0.25],
      [1.66, -0.15],
      [0.9, -0.03],
      [0.14, 0.12],
      [-0.75, 0.1],
      [-1.77, 0.15],
      [-2.79, 0.2],
      [-3.45, 0.23],
    ],
    false,
  );
  g.strokeStyle = "#C8313B";
  g.lineWidth = 4;
  g.stroke();
  path(
    [
      [3.2, -0.4],
      [2.16, -0.28],
      [1.4, -0.2],
      [0.64, -0.05],
      [-0.5, 0.04],
      [-1.77, 0.1],
      [-3.45, 0.18],
    ],
    false,
  );
  g.strokeStyle = "#20262B";
  g.lineWidth = 6;
  g.stroke();
  const glass = () => {
    const gr = g.createLinearGradient(0, P([0, 0.7])[1], 0, P([0, 0.1])[1]);
    gr.addColorStop(0, "#3A4C5A");
    gr.addColorStop(1, "#131C24");
    return gr;
  };
  path([
    [2.45, 0.24],
    [1.93, 0.12],
    [1.73, 0.6],
    [1.72, 1.0],
    [2.47, 1.0],
  ]);
  g.fillStyle = glass();
  g.fill();
  [WIN.rear].forEach((w) => {
    path(w);
    g.fillStyle = glass();
    g.fill();
    g.strokeStyle = "#0B1014";
    g.lineWidth = 3;
    g.stroke();
  });
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
